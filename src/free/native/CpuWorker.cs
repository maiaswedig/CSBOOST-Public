using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

// Independent Windows API bridge. This executable never starts/stops a process.
internal static class CpuWorker {
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetLogicalProcessorInformationEx(int relation,IntPtr buffer,ref uint length);
  [DllImport("kernel32.dll")] static extern ushort GetActiveProcessorGroupCount();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessAffinityMask(IntPtr process,out UIntPtr processMask,out UIntPtr systemMask);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetProcessAffinityMask(IntPtr process,UIntPtr mask);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
  static readonly HashSet<string> Allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase){"cs2","chrome","msedge","firefox","Discord","Spotify","OneDrive","steamwebhelper","Slack","Telegram","Teams","ms-teams","obs64"};
  static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
  static void Emit(object value){Console.WriteLine(Json.Serialize(value));}
  static ulong Mask(string value){ulong parsed;if(value.Length>16||!ulong.TryParse(value,NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out parsed)||parsed==0)throw new Exception("Invalid affinity mask");return parsed;}
  static string Hex(ulong value){return value.ToString("x",CultureInfo.InvariantCulture);}
  static object Topology(){
    uint size=0;GetLogicalProcessorInformationEx(0,IntPtr.Zero,ref size);if(size==0||size>1048576)throw new Exception("Topology unavailable");
    IntPtr buffer=Marshal.AllocHGlobal((int)size);try{
      if(!GetLogicalProcessorInformationEx(0,buffer,ref size))throw new Exception("Topology read failed");
      var cores=new List<object>();uint offset=0;
      while(offset<size){IntPtr record=IntPtr.Add(buffer,(int)offset);uint recordSize=(uint)Marshal.ReadInt32(record,4);if(recordSize<48||offset+recordSize>size)throw new Exception("Invalid topology record");
        int relation=Marshal.ReadInt32(record,0);if(relation==0){byte efficiency=Marshal.ReadByte(record,9);ushort groups=(ushort)Marshal.ReadInt16(record,30);if(groups<1||32+16*groups>recordSize)throw new Exception("Invalid core record");
          for(int i=0;i<groups;i++){int start=32+i*16;ulong mask=unchecked((ulong)Marshal.ReadInt64(record,start));ushort group=(ushort)Marshal.ReadInt16(record,start+8);cores.Add(new {group=group,mask=Hex(mask),efficiencyClass=efficiency});}}
        offset+=recordSize;
      }
      UIntPtr current,system;if(!GetProcessAffinityMask(Process.GetCurrentProcess().Handle,out current,out system))throw new Exception("System mask unavailable");
      return new {supported=GetActiveProcessorGroupCount()==1,groups=GetActiveProcessorGroupCount(),systemMask=Hex(system.ToUInt64()),cores=cores};
    }finally{Marshal.FreeHGlobal(buffer);}
  }
  static object ProcessOperation(string[] args){
    if(GetActiveProcessorGroupCount()!=1)throw new Exception("Multiple processor groups are not supported");
    int pid;if(args.Length<2||!int.TryParse(args[1],out pid)||pid<1)throw new Exception("Invalid PID");
    Process process;try{process=Process.GetProcessById(pid);}catch(ArgumentException){return new {status="exited"};}
    using(process){
      if(!Allowed.Contains(process.ProcessName)||process.SessionId!=Process.GetCurrentProcess().SessionId)throw new Exception("Process outside allowed scope");
      string startedAt=process.StartTime.ToUniversalTime().ToString("o"),exe=process.MainModule.FileName;UIntPtr current,system;
      if(!GetProcessAffinityMask(process.Handle,out current,out system))throw new Exception("Affinity read denied");
      if(args[0]=="get")return new {status="ok",pid=pid,name=process.ProcessName,path=exe,startedAt=startedAt,mask=Hex(current.ToUInt64()),systemMask=Hex(system.ToUInt64())};
      if(args[0]!="set"||args.Length!=6)throw new Exception("Invalid operation");
      string expectedPath=Encoding.UTF8.GetString(Convert.FromBase64String(args[3]));
      if(startedAt!=args[2]||!String.Equals(exe,expectedPath,StringComparison.OrdinalIgnoreCase))return new {status="replaced"};
      ulong expected=Mask(args[4]),desired=Mask(args[5]);if(current.ToUInt64()!=expected)return new {status="conflict"};
      if((desired&system.ToUInt64())!=desired)throw new Exception("Mask exceeds available CPUs");
      if(!SetProcessAffinityMask(process.Handle,new UIntPtr(desired)))throw new Exception("Affinity write denied");
      if(!GetProcessAffinityMask(process.Handle,out current,out system)||current.ToUInt64()!=desired)throw new Exception("Affinity not confirmed");return new {status="changed"};
    }
  }
  static object Focus(string encodedPath){try{uint pid;GetWindowThreadProcessId(GetForegroundWindow(),out pid);using(Process process=Process.GetProcessById((int)pid)){return new {focused=process.ProcessName.Equals("cs2",StringComparison.OrdinalIgnoreCase)&&process.SessionId==Process.GetCurrentProcess().SessionId&&String.Equals(process.MainModule.FileName,Encoding.UTF8.GetString(Convert.FromBase64String(encodedPath)),StringComparison.OrdinalIgnoreCase)};}}catch{return new {focused=false};}}
  static int Main(string[] args){Console.OutputEncoding=new UTF8Encoding(false);try{if(IntPtr.Size!=8)throw new Exception("Requires x64");if(args.Length==1&&args[0]=="topology")Emit(Topology());else if(args.Length==2&&args[0]=="focused")Emit(Focus(args[1]));else Emit(ProcessOperation(args));return 0;}catch(Exception error){Emit(new {status="error",error=error.Message});return 1;}}
}
