using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// Read-only Windows topology bridge. No process handles, setters, affinity,
// CPU Sets allocation, registry writes, services or kernel drivers are used.
internal static class TopologyWorker {
  const int Limit = 4194304;
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetSystemCpuSetInformation(IntPtr buffer,uint length,out uint returned,IntPtr process,uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetLogicalProcessorInformationEx(int relation,IntPtr buffer,ref uint length);
  [DllImport("kernel32.dll")] static extern ushort GetActiveProcessorGroupCount();
  [DllImport("kernel32.dll")] static extern uint GetActiveProcessorCount(ushort group);
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer {MaxJsonLength=2097152,RecursionLimit=20};
  static Dictionary<string,object> Obj(params object[] values){var result=new Dictionary<string,object>();for(int i=0;i<values.Length;i+=2)result.Add((string)values[i],values[i+1]);return result;}
  static uint U32(byte[] bytes,int offset){return BitConverter.ToUInt32(bytes,offset);}
  static ushort U16(byte[] bytes,int offset){return BitConverter.ToUInt16(bytes,offset);}
  static void Header(byte[] bytes,int offset,out int size,out uint type){
    if(bytes==null||bytes.Length>Limit||offset<0||offset>bytes.Length-8)throw new InvalidOperationException("Truncated topology header");
    uint raw=U32(bytes,offset);if(raw<8||raw>(uint)(bytes.Length-offset))throw new InvalidOperationException("Invalid topology record Size");
    size=(int)raw;type=U32(bytes,offset+4);
  }
  internal static List<object> ParseCpuSets(byte[] bytes){
    if(bytes==null||bytes.Length>Limit)throw new InvalidOperationException("Invalid CPU Sets buffer");
    var rows=new List<object>();int offset=0;
    while(offset<bytes.Length){int size;uint type;Header(bytes,offset,out size,out type);
      if(type==0){if(size<32)throw new InvalidOperationException("Truncated CPU Set record");
        byte flags=bytes[offset+19];rows.Add(Obj("id",U32(bytes,offset+8),"group",U16(bytes,offset+12),"logicalProcessorIndex",bytes[offset+14],"coreIndex",bytes[offset+15],"lastLevelCacheIndex",bytes[offset+16],"numaNodeIndex",bytes[offset+17],"efficiencyClass",bytes[offset+18],"parked",(flags&1)!=0,"allocated",(flags&2)!=0,"allocatedToTargetProcess",(flags&4)!=0,"realTime",(flags&8)!=0));
        if(rows.Count>4096)throw new InvalidOperationException("Too many CPU Sets");
      }
      offset+=size;
    }return rows;
  }
  internal static List<object> ParseCaches(byte[] bytes){
    if(bytes==null||bytes.Length>Limit)throw new InvalidOperationException("Invalid cache buffer");
    var rows=new List<object>();int offset=0;
    while(offset<bytes.Length){
      // SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX starts with Relationship, Size,
      // unlike SYSTEM_CPU_SET_INFORMATION, whose first fields are Size, Type.
      if(bytes.Length-offset<8)throw new InvalidOperationException("Truncated cache header");
      uint relation=U32(bytes,offset),raw=U32(bytes,offset+4);
      if(raw<8||raw>(uint)(bytes.Length-offset))throw new InvalidOperationException("Invalid cache record Size");int size=(int)raw;
      if(relation==2){if(size<56)throw new InvalidOperationException("Truncated CACHE_RELATIONSHIP");
        byte level=bytes[offset+8];uint count=U16(bytes,offset+38);
        // Older Windows uses these two bytes as reserved and has one GroupMask.
        // Accept that layout only at its exact 56-byte x64 size.
        bool legacy=count==0&&size==56;if(legacy)count=1;
        if(count<1||count>64||40+16*count>(uint)size)throw new InvalidOperationException("Invalid cache group mask count");
        var groups=new List<object>();for(int i=0;i<count;i++){int pos=offset+40+16*i;ulong mask=BitConverter.ToUInt64(bytes,pos);if(mask==0)throw new InvalidOperationException("Empty cache mask");groups.Add(Obj("group",U16(bytes,pos+8),"mask",mask.ToString("x",CultureInfo.InvariantCulture)));}
        if(level==3)rows.Add(Obj("level",3,"sizeBytes",U32(bytes,offset+12),"cacheType",U32(bytes,offset+16),"groups",groups,"legacySingleGroup",legacy));
        if(rows.Count>4096)throw new InvalidOperationException("Too many cache records");
      }offset+=size;
    }return rows;
  }
  static byte[] CpuBytes(){
    uint required;bool first=GetSystemCpuSetInformation(IntPtr.Zero,0,out required,IntPtr.Zero,0);int error=Marshal.GetLastWin32Error();
    if(!first&&error!=122)throw new InvalidOperationException("GetSystemCpuSetInformation failed ("+error+")");
    if(required==0)return new byte[0];
    for(int attempt=0;attempt<3;attempt++){
      if(required>Limit)throw new InvalidOperationException("CPU Sets buffer exceeds limit");uint capacity=required;IntPtr buffer=Marshal.AllocHGlobal((int)capacity);
      try{uint length;if(GetSystemCpuSetInformation(buffer,capacity,out length,IntPtr.Zero,0)){if(length>capacity)throw new InvalidOperationException("CPU Sets length exceeds buffer");var bytes=new byte[length];Marshal.Copy(buffer,bytes,0,(int)length);return bytes;}error=Marshal.GetLastWin32Error();if(error!=122||length<=capacity)throw new InvalidOperationException("CPU Sets query failed ("+error+")");required=length;}finally{Marshal.FreeHGlobal(buffer);}
    }throw new InvalidOperationException("CPU Sets changed repeatedly during enumeration");
  }
  static byte[] CacheBytes(){
    uint required=0;bool first=GetLogicalProcessorInformationEx(2,IntPtr.Zero,ref required);int error=Marshal.GetLastWin32Error();
    if(!first&&error!=122)throw new InvalidOperationException("RelationCache failed ("+error+")");
    if(required==0)return new byte[0];
    for(int attempt=0;attempt<3;attempt++){
      if(required>Limit)throw new InvalidOperationException("Cache buffer exceeds limit");uint capacity=required;IntPtr buffer=Marshal.AllocHGlobal((int)capacity);
      try{uint length=capacity;if(GetLogicalProcessorInformationEx(2,buffer,ref length)){if(length>capacity)throw new InvalidOperationException("Cache length exceeds buffer");var bytes=new byte[length];Marshal.Copy(buffer,bytes,0,(int)length);return bytes;}error=Marshal.GetLastWin32Error();if(error!=122||length<=capacity)throw new InvalidOperationException("Cache query failed ("+error+")");required=length;}finally{Marshal.FreeHGlobal(buffer);}
    }throw new InvalidOperationException("Caches changed repeatedly during enumeration");
  }
  static string TextValue(RegistryKey key,string name){var value=key==null?null:key.GetValue(name,null,RegistryValueOptions.DoNotExpandEnvironmentNames);var text=value as string;return text!=null&&text.Length<=512?text.Trim():null;}
  static object Read(){
    var watch=Stopwatch.StartNew();var warnings=new List<string>();string name=null,vendor=null;object groups=null,logical=null;var sets=new List<object>();var caches=new List<object>();string cpuApi="unknown",cacheApi="unknown",gameMode="unknown";double? cpuSetQueryMs=null,cacheQueryMs=null;
    try{using(var key=Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0",false)){name=TextValue(key,"ProcessorNameString");vendor=TextValue(key,"VendorIdentifier");}}catch{warnings.Add("CPU identity unavailable");}
    try{groups=GetActiveProcessorGroupCount();logical=GetActiveProcessorCount(0xffff);}catch{warnings.Add("Processor group count unavailable");}
    var query=Stopwatch.StartNew();try{sets=ParseCpuSets(CpuBytes());cpuApi="available";cpuSetQueryMs=query.Elapsed.TotalMilliseconds;}catch(Exception error){warnings.Add(error.Message);}
    query.Restart();try{caches=ParseCaches(CacheBytes());cacheApi="available";cacheQueryMs=query.Elapsed.TotalMilliseconds;}catch(Exception error){warnings.Add(error.Message);}
    // Microsoft documents this Game Mode preference in its Windows 11
    // settings reference. Keep it unknown on Windows 10 rather than treating
    // an undocumented registry value as a verified setting.
    try{if(Environment.OSVersion.Version.Build>=22000){using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\GameBar",false)){if(key!=null&&key.GetValueKind("AutoGameModeEnabled")==RegistryValueKind.DWord){int value=(int)key.GetValue("AutoGameModeEnabled");if(value==0||value==1)gameMode=value==1?"enabled":"disabled";}}}}catch{ }
    watch.Stop();double? processCpuMs=null;long? peakWorkingSetBytes=null;try{using(var self=Process.GetCurrentProcess()){processCpuMs=self.TotalProcessorTime.TotalMilliseconds;peakWorkingSetBytes=self.PeakWorkingSet64;}}catch{ }
    return Obj("schemaVersion",1,"source","GetSystemCpuSetInformation/RelationCache","cpuName",name,"cpuVendor",vendor,"processorGroups",groups,"activeLogicalProcessors",logical,"cpuSetsStatus",cpuApi,"cacheStatus",cacheApi,"cpuSets",sets,"caches",caches,"gameMode",gameMode,"queryDurationMs",watch.Elapsed.TotalMilliseconds,"cpuSetQueryDurationMs",cpuSetQueryMs,"cacheQueryDurationMs",cacheQueryMs,"processCpuMs",processCpuMs,"peakWorkingSetBytes",peakWorkingSetBytes,"warnings",warnings);
  }
  static int Main(string[] args){Console.OutputEncoding=new UTF8Encoding(false);try{if(IntPtr.Size!=8)throw new InvalidOperationException("Requires Windows x64");if(args.Length!=1||args[0]!="--read")throw new InvalidOperationException("Only --read is supported");Console.WriteLine(Json.Serialize(Obj("ok",true,"value",Read())));return 0;}catch(Exception error){Console.WriteLine(Json.Serialize(Obj("ok",false,"error",error.Message)));return 1;}}
}
