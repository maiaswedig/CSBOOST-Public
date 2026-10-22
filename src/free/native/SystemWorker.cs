using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Diagnostics.Eventing.Reader;
using System.Globalization;
using System.Management;
using System.Net.NetworkInformation;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// Fixed inventory plus allowlisted HKCU and desktop preferences. No driver/firmware setters.
internal static class SystemWorker {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=262144,RecursionLimit=16};
  [StructLayout(LayoutKind.Sequential)] struct PowerStatus {public byte ACLineStatus,BatteryFlag,BatteryLifePercent,SystemStatusFlag;public uint BatteryLifeTime,BatteryFullLifeTime;}
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetSystemPowerStatus(out PowerStatus value);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFirmwareType(out uint type);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct TrustFileInfo { public uint size; public IntPtr path; public IntPtr file; public IntPtr subject; }
  [StructLayout(LayoutKind.Sequential)] struct TrustData { public uint size; public IntPtr policy; public IntPtr sip; public uint uiChoice; public uint revocation; public uint unionChoice; public IntPtr file; public uint stateAction; public IntPtr stateData; public IntPtr urlReference; public uint providerFlags; public uint uiContext; public IntPtr signatureSettings; }
  [DllImport("wintrust.dll",ExactSpelling=true,PreserveSig=true)] static extern int WinVerifyTrust(IntPtr hwnd,ref Guid action,IntPtr data);
  static readonly Guid GenericVerifyV2=new Guid("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");
  static Dictionary<string,object> Obj(params object[] fields){var result=new Dictionary<string,object>();for(int i=0;i<fields.Length;i+=2)result.Add((string)fields[i],fields[i+1]);return result;}
  static List<Dictionary<string,object>> Query(string scope,string query){
    var rows=new List<Dictionary<string,object>>();var options=new EnumerationOptions {Timeout=TimeSpan.FromSeconds(2),ReturnImmediately=false};
    using(var search=new ManagementObjectSearcher(new ManagementScope(scope),new ObjectQuery(query),options))using(var collection=search.Get())foreach(ManagementObject item in collection){using(item){var row=new Dictionary<string,object>();foreach(PropertyData property in item.Properties)row[property.Name]=property.Value;rows.Add(row);if(rows.Count>64)throw new Exception("Inventory exceeds limit");}}return rows;
  }
  static string Text(Dictionary<string,object> row,string key){object value;return row.TryGetValue(key,out value)&&value!=null?Convert.ToString(value,CultureInfo.InvariantCulture).Trim():"";}
  static long Number(Dictionary<string,object> row,string key){long value;return long.TryParse(Text(row,key),out value)?value:0;}
  static Dictionary<string,object> First(string query){var rows=Query(@"root\cimv2",query);if(rows.Count<1)throw new Exception("WMI inventory unavailable");return rows[0];}
  static bool ValidGameExe(string value){return !String.IsNullOrEmpty(value)&&Path.IsPathRooted(value)&&value.Length<=32767&&!value.Contains("\0")&&!Regex.IsMatch(value,@"(^|[\\/])\.\.([\\/]|$)")&&value.EndsWith(@"\game\bin\win64\cs2.exe",StringComparison.OrdinalIgnoreCase);}
  static bool BrowserPolicy(string key,string name){return (key==@"Software\Policies\Microsoft\Edge"&&(name=="BackgroundModeEnabled"||name=="StartupBoostEnabled"))||(key==@"Software\Policies\Google\Chrome"&&name=="BackgroundModeEnabled");}
  static bool RegistryTarget(string key,string name){return BrowserPolicy(key,name)||(key==@"Software\Microsoft\GameBar"&&name=="AutoGameModeEnabled")||(key==@"Software\Microsoft\Windows\CurrentVersion\GameDVR"&&name=="AppCaptureEnabled")||((key==@"Software\Microsoft\DirectX\UserGpuPreferences"||key==@"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers")&&ValidGameExe(name));}
  static bool MachineBrowserPolicy(string key){
    foreach(RegistryView view in new[]{RegistryView.Registry64,RegistryView.Registry32})using(var root=RegistryKey.OpenBaseKey(RegistryHive.LocalMachine,view))using(var policy=root.OpenSubKey(key,false)){if(policy!=null&&(policy.ValueCount>0||policy.SubKeyCount>0))return true;}
    return false;
  }
  static Dictionary<string,object> BrowserInventory(){
    var result=new Dictionary<string,object>();
    foreach(string browser in new[]{"edge","chrome"}){
      string relative=browser=="edge"?@"Microsoft\Edge\Application\msedge.exe":@"Google\Chrome\Application\chrome.exe";int major=0;bool installed=false;
      foreach(string root in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)}){
        if(String.IsNullOrEmpty(root))continue;string exe=Path.Combine(root,relative);if(!File.Exists(exe))continue;
        try{var version=FileVersionInfo.GetVersionInfo(exe);major=Math.Max(major,version.FileMajorPart);installed=true;}catch{}
      }
      string key=browser=="edge"?@"Software\Policies\Microsoft\Edge":@"Software\Policies\Google\Chrome";
      result[browser]=Obj("installed",installed,"majorVersion",major,"machineManaged",MachineBrowserPolicy(key));
    }return result;
  }
  static Dictionary<string,object> RegistryOperation(Dictionary<string,object> request){
    string action=Text(request,"action"),key=Text(request,"key"),name=Text(request,"name");if(!RegistryTarget(key,name))throw new Exception("Invalid registry target");
    if(BrowserPolicy(key,name)&&action!="read"&&MachineBrowserPolicy(key))throw new Exception("Machine browser policy present; preserved");
    if(action=="read"){
      using(var item=Registry.CurrentUser.OpenSubKey(key,false)){if(item==null||item.GetValueNames().Length==0||Array.IndexOf(item.GetValueNames(),name)<0)return Obj("exists",false);var kind=item.GetValueKind(name);if(kind!=RegistryValueKind.DWord&&kind!=RegistryValueKind.String)throw new Exception("Unexpected registry type");object currentData=item.GetValue(name,null,RegistryValueOptions.DoNotExpandEnvironmentNames);if(kind==RegistryValueKind.DWord)currentData=unchecked((uint)(int)currentData);return Obj("exists",true,"type",kind==RegistryValueKind.DWord?"DWord":"String","data",currentData);}
    }
    if(action=="remove"){
      using(var item=Registry.CurrentUser.OpenSubKey(key,true)){if(item!=null)item.DeleteValue(name,false);}return Obj("changed",true);
    }
    if(action!="write")throw new Exception("Invalid registry action");
    object raw;if(!request.TryGetValue("value",out raw)||!(raw is Dictionary<string,object>))throw new Exception("Invalid registry value");var value=(Dictionary<string,object>)raw;string type=Text(value,"type");object data;
    if(type=="DWord"){
      long number;if(!value.TryGetValue("data",out raw)||!Int64.TryParse(Convert.ToString(raw,CultureInfo.InvariantCulture),NumberStyles.Integer,CultureInfo.InvariantCulture,out number)||number<0||number>UInt32.MaxValue)throw new Exception("Invalid DWORD value");data=unchecked((int)(uint)number);
    }else if(type=="String"){
      if(!value.TryGetValue("data",out raw)||!(raw is string)||((string)raw).Length>32767||((string)raw).IndexOf('\0')>=0)throw new Exception("Invalid string value");data=(string)raw;
    }else throw new Exception("Unexpected registry type");
    using(var item=Registry.CurrentUser.CreateSubKey(key)){if(item==null)throw new Exception("Registry key unavailable");item.SetValue(name,data,type=="DWord"?RegistryValueKind.DWord:RegistryValueKind.String);}
    return Obj("changed",true);
  }

  [DllImport("user32.dll",EntryPoint="SystemParametersInfoW",SetLastError=true)] static extern bool Spi(uint action,uint parameter,IntPtr data,uint flags);
  static Dictionary<string,object> DesktopPreference(Dictionary<string,object> request){
    string action=Text(request,"action"),name=Text(request,"name");
    uint effect=0;switch(name){case "clientAnimations":effect=0x1042;break;case "menuAnimations":effect=0x1002;break;case "tooltipAnimations":effect=0x1016;break;case "listScrolling":effect=0x1006;break;case "comboAnimations":effect=0x1004;break;}
    if(effect!=0){
      if(action=="read"){IntPtr result=Marshal.AllocHGlobal(4);try{if(!Spi(effect,0,result,0))throw new Exception("Effect read failed");return Obj("exists",true,"type","DWord","data",Marshal.ReadInt32(result)==0?0:1);}finally{Marshal.FreeHGlobal(result);}}
      object rawEffect;if(action!="write"||!request.TryGetValue("value",out rawEffect)||!(rawEffect is Dictionary<string,object>))throw new Exception("Invalid effect request");
      var v=(Dictionary<string,object>)rawEffect;if(!Keys(v,"type","data")||Text(v,"type")!="DWord"||!(v["data"] is int)||((int)v["data"]!=0&&(int)v["data"]!=1))throw new Exception("Invalid effect value");
      if(!Spi(effect+1,0,new IntPtr((int)v["data"]),3))throw new Exception("Effect write failed");return Obj("changed",true);
    }
    if((action!="read"&&action!="write")||(name!="mouseAcceleration"&&name!="menuDelay"))throw new Exception("Invalid desktop preference");
    bool mouse=name=="mouseAcceleration";IntPtr buffer=Marshal.AllocHGlobal(12);
    try{
      if(action=="read"){
        if(!Spi(mouse?0x0003u:0x006Au,0,buffer,0))throw new Exception("Desktop preference read failed");
        return mouse?Obj("exists",true,"type","String","data",Marshal.ReadInt32(buffer,0)+","+Marshal.ReadInt32(buffer,4)+","+Marshal.ReadInt32(buffer,8)):Obj("exists",true,"type","DWord","data",unchecked((uint)Marshal.ReadInt32(buffer)));
      }
      object raw;if(!request.TryGetValue("value",out raw)||!(raw is Dictionary<string,object>))throw new Exception("Invalid desktop value");
      var value=(Dictionary<string,object>)raw;if(!Keys(value,"type","data"))throw new Exception("Unknown desktop value fields");
      if(mouse){
        if(Text(value,"type")!="String"||!(value["data"] is string))throw new Exception("Invalid mouse type");
        string[] parts=((string)value["data"]).Split(',');if(parts.Length!=3)throw new Exception("Invalid mouse tuple");
        for(int i=0;i<3;i++){int n;if(!Regex.IsMatch(parts[i],@"^\d+$")||!Int32.TryParse(parts[i],out n)||n<0||(i==2&&n>2))throw new Exception("Invalid mouse value");Marshal.WriteInt32(buffer,i*4,n);}
        if(!Spi(0x0004,0,buffer,3))throw new Exception("Mouse preference write failed");
      }else{
        uint delay;if(Text(value,"type")!="DWord"||!(value["data"] is int||value["data"] is long||value["data"] is uint)||!UInt32.TryParse(Text(value,"data"),out delay))throw new Exception("Invalid menu delay");
        if(!Spi(0x006B,delay,IntPtr.Zero,3))throw new Exception("Menu preference write failed");
      }
      return Obj("changed",true);
    }finally{Marshal.FreeHGlobal(buffer);}
  }
  static object NetworkInfo(){
    var rows=new List<object>();foreach(var adapter in NetworkInterface.GetAllNetworkInterfaces()){
      if(adapter.NetworkInterfaceType==NetworkInterfaceType.Loopback)continue;if(rows.Count>=64)throw new Exception("Network inventory exceeds limit");
      string type=adapter.NetworkInterfaceType==NetworkInterfaceType.Wireless80211?"wifi":adapter.NetworkInterfaceType==NetworkInterfaceType.Ethernet?"ethernet":"other";
      object gateway=null,speed=null;try{gateway=adapter.GetIPProperties().GatewayAddresses.Count>0;}catch{}try{long value=adapter.Speed;if(value>0&&value<=9007199254740991L)speed=value;}catch{}
      rows.Add(Obj("type",type,"up",adapter.OperationalStatus==OperationalStatus.Up,"speedBps",speed,"gateway",gateway));
    }return Obj("adapters",rows);
  }
  static bool CheckPath(string value,bool recursive){
    if(String.IsNullOrEmpty(value)||!Path.IsPathRooted(value)||value.Length>32767||value.Contains("\0")||Regex.IsMatch(value,@"(^|[\\/])\.\.([\\/]|$)"))throw new Exception("Invalid path");string full=Path.GetFullPath(value),current=full;
    while(!String.IsNullOrEmpty(current)){if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new Exception("Reparse point detected");DirectoryInfo parent=Directory.GetParent(current);current=parent==null?null:parent.FullName;}
    if(recursive){if((File.GetAttributes(full)&FileAttributes.Directory)==0)throw new Exception("Recursive path is not a directory");var queue=new Queue<string>();queue.Enqueue(full);int count=0;while(queue.Count>0){string directory=queue.Dequeue();foreach(string entry in Directory.EnumerateFileSystemEntries(directory)){if(++count>4096)throw new Exception("Path exceeds entry limit");FileAttributes attributes=File.GetAttributes(entry);if((attributes&FileAttributes.ReparsePoint)!=0)throw new Exception("Reparse point detected");if((attributes&FileAttributes.Directory)!=0)queue.Enqueue(entry);}}}
    return true;
  }
  static string HashFile(string file){using(var sha=SHA256.Create())using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)){return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}}
  static string SignatureStatus(string file){
    IntPtr nativePath=IntPtr.Zero,filePointer=IntPtr.Zero,dataPointer=IntPtr.Zero;try{
      nativePath=Marshal.StringToHGlobalUni(file);var info=new TrustFileInfo{size=(uint)Marshal.SizeOf(typeof(TrustFileInfo)),path=nativePath};filePointer=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(TrustFileInfo)));Marshal.StructureToPtr(info,filePointer,false);
      var data=new TrustData{size=(uint)Marshal.SizeOf(typeof(TrustData)),uiChoice=2,revocation=0,unionChoice=1,file=filePointer,stateAction=0,providerFlags=0x00001000,uiContext=0};dataPointer=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(TrustData)));Marshal.StructureToPtr(data,dataPointer,false);Guid action=GenericVerifyV2;uint status=unchecked((uint)WinVerifyTrust(IntPtr.Zero,ref action,dataPointer));if(status==0)return "Valid";if(status==0x800B0100)return "NotSigned";if(status==0x80096010)return "HashMismatch";if(status==0x800B0109)return "NotTrusted";return "UnknownError";
    }finally{if(dataPointer!=IntPtr.Zero)Marshal.FreeHGlobal(dataPointer);if(filePointer!=IntPtr.Zero)Marshal.FreeHGlobal(filePointer);if(nativePath!=IntPtr.Zero)Marshal.FreeHGlobal(nativePath);}
  }
  static string SignerName(string file){try{using(var certificate=new X509Certificate2(X509Certificate.CreateFromSignedFile(file))){return certificate.GetNameInfo(X509NameType.SimpleName,false);}}catch{return "";}}
  static bool HasReparse(string file){string current=file;while(!String.IsNullOrEmpty(current)){if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)return true;DirectoryInfo parent=Directory.GetParent(current);current=parent==null?null:parent.FullName;}return false;}
  static Dictionary<string,object> Binary(string full,bool driver){
    try{full=Path.GetFullPath(full);if(!File.Exists(full)||HasReparse(full))return null;FileInfo file=new FileInfo(full);if(driver&&(file.Length>67108864||!String.Equals(file.Extension,".sys",StringComparison.OrdinalIgnoreCase)))return null;var version=FileVersionInfo.GetVersionInfo(full).FileVersion??"";string signature=SignatureStatus(full);return Obj("path",full,"regular",true,"reparse",false,"version",version,"signatureStatus",signature,"signer",SignerName(full),"sha256",HashFile(full));}catch{return null;}
  }
  static List<string> ProgramFilesRoots(){var result=new List<string>();string[] values={Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetEnvironmentVariable("ProgramW6432")};foreach(string value in values)if(!String.IsNullOrEmpty(value)){string full=Path.GetFullPath(value);if(!result.Exists(item=>String.Equals(item,full,StringComparison.OrdinalIgnoreCase)))result.Add(full);}return result;}
  static object AmdInventory(){
    var cpu=First("SELECT Name,Manufacturer,NumberOfCores,NumberOfLogicalProcessors,ProcessorId FROM Win32_Processor");var board=First("SELECT Manufacturer,Product,Version FROM Win32_BaseBoard");var bios=First("SELECT SMBIOSBIOSVersion,ReleaseDate FROM Win32_BIOS");var os=First("SELECT Version,OSArchitecture FROM Win32_OperatingSystem");
    var roots=ProgramFilesRoots();var candidates=new List<string>();foreach(string root in roots){candidates.Add(Path.Combine(root,"AMD","RyzenMaster","bin","AMD Ryzen Master.exe"));candidates.Add(Path.Combine(root,"AMD","RyzenMaster","AMD Ryzen Master.exe"));}
    string[] uninstall={@"Software\Microsoft\Windows\CurrentVersion\Uninstall",@"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"};int appCount=0;foreach(string uninstallPath in uninstall){try{using(var key=Registry.LocalMachine.OpenSubKey(uninstallPath,false)){if(key==null)continue;foreach(string subname in key.GetSubKeyNames()){if(++appCount>4096)break;try{using(var item=key.OpenSubKey(subname,false)){if(item==null)continue;string display=Convert.ToString(item.GetValue("DisplayName",""),CultureInfo.InvariantCulture);if(!Regex.IsMatch(display,@"^AMD Ryzen Master(?:\s|$)",RegexOptions.IgnoreCase))continue;string location=Convert.ToString(item.GetValue("InstallLocation",""),CultureInfo.InvariantCulture);if(String.IsNullOrWhiteSpace(location))continue;candidates.Add(Path.Combine(location,"bin","AMD Ryzen Master.exe"));candidates.Add(Path.Combine(location,"AMD Ryzen Master.exe"));}}catch{}}}}catch{}}
    var executables=new List<object>();foreach(string candidate in candidates){try{string full=Path.GetFullPath(candidate);bool allowed=false;foreach(string root in roots){string prefix=Path.GetFullPath(Path.Combine(root,"AMD"))+Path.DirectorySeparatorChar;if(full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase))allowed=true;}if(!allowed||!String.Equals(Path.GetFileName(full),"AMD Ryzen Master.exe",StringComparison.OrdinalIgnoreCase)||!File.Exists(full)||HasReparse(full))continue;var descriptor=Binary(full,false);if(descriptor!=null&&!executables.Exists(item=>String.Equals(Convert.ToString(((Dictionary<string,object>)item)["path"]),full,StringComparison.OrdinalIgnoreCase)))executables.Add(descriptor);if(executables.Count>=48)break;}catch{}}
    string driverQuery="SELECT Name,State,StartMode,PathName FROM Win32_SystemDriver WHERE Name LIKE 'AMDRyzenMasterDriver%' OR Name='PawnIO' OR Name='WinRing0' OR Name='WinRing0_1_2_0' OR Name='RyzenSMU'";var drivers=new List<object>();foreach(var row in Query(@"root\cimv2",driverQuery)){string name=Text(row,"Name");if(!Regex.IsMatch(name,@"^(?:AMDRyzenMasterDriver(?:V\d+)?|PawnIO|WinRing0(?:_1_2_0)?|RyzenSMU)$",RegexOptions.IgnoreCase))continue;string driverPath=Text(row,"PathName").Trim('"');if(driverPath.StartsWith(@"\??\",StringComparison.Ordinal))driverPath=driverPath.Substring(4);if(driverPath.StartsWith(@"\SystemRoot\",StringComparison.OrdinalIgnoreCase))driverPath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),driverPath.Substring(12));Dictionary<string,object> binary=null;if(Regex.IsMatch(driverPath,@"^[A-Za-z]:\\")&&String.Equals(Path.GetExtension(driverPath),".sys",StringComparison.OrdinalIgnoreCase))binary=Binary(driverPath,true);drivers.Add(Obj("name",name,"state",Text(row,"State"),"startMode",Text(row,"StartMode"),"binary",binary));if(drivers.Count>=32)break;}
    string release=null;try{string raw=Text(bios,"ReleaseDate");if(raw.Length>0)release=ManagementDateTimeConverter.ToDateTime(raw).ToUniversalTime().ToString("o");}catch{}
    var modules=new List<object>();foreach(var row in Query(@"root\cimv2","SELECT DeviceLocator,BankLabel,Capacity,Manufacturer,PartNumber,ConfiguredClockSpeed,Speed,SMBIOSMemoryType,ConfiguredVoltage,FormFactor FROM Win32_PhysicalMemory"))modules.Add(Obj("locator",Text(row,"DeviceLocator"),"bank",Text(row,"BankLabel"),"capacityBytes",Number(row,"Capacity"),"manufacturer",Text(row,"Manufacturer"),"partNumber",Text(row,"PartNumber"),"configuredClockMHz",Number(row,"ConfiguredClockSpeed"),"reportedSpeed",Number(row,"Speed"),"smbiosType",Number(row,"SMBIOSMemoryType"),"configuredVoltageMv",Number(row,"ConfiguredVoltage"),"formFactor",Number(row,"FormFactor")));
    return Obj("cpu",Obj("name",Text(cpu,"Name"),"manufacturer",Text(cpu,"Manufacturer"),"physicalCores",Number(cpu,"NumberOfCores"),"logicalCores",Number(cpu,"NumberOfLogicalProcessors"),"processorId",Text(cpu,"ProcessorId")),"board",Obj("manufacturer",Text(board,"Manufacturer"),"product",Text(board,"Product"),"version",Text(board,"Version")),"bios",Obj("version",Text(bios,"SMBIOSBIOSVersion"),"releaseDate",release),"os",Obj("version",Text(os,"Version"),"architecture",Text(os,"OSArchitecture")),"programFiles",roots,"drivers",drivers,"executables",executables,"modules",modules);
  }
  static object GpuInventory(){
    var adapters=new List<object>();foreach(var row in Query(@"root\cimv2","SELECT Name,PNPDeviceID FROM Win32_VideoController")){string name=Text(row,"Name"),pnp=Text(row,"PNPDeviceID");if(name.Length==0)continue;adapters.Add(Obj("name",name,"pnpDeviceId",pnp));if(adapters.Count>=16)break;}
    object adrenalin=null;foreach(string root in ProgramFilesRoots()){try{string folder=Path.GetFullPath(Path.Combine(root,"AMD","CNext","CNext")),full=Path.Combine(folder,"RadeonSoftware.exe");if(!File.Exists(full)||HasReparse(full))continue;var descriptor=Binary(full,false);if(descriptor==null||descriptor["signatureStatus"].ToString()!="Valid"||!Regex.IsMatch(descriptor["signer"].ToString(),@"^Advanced Micro Devices(?:,? Inc\.?)?$",RegexOptions.IgnoreCase))continue;adrenalin=descriptor;break;}catch{}}
    return Obj("adapters",adapters,"adrenalin",adrenalin);
  }
  static object AmdEvents(string since,string until){
    DateTime start,end;if(!DateTime.TryParse(since,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out start)||!DateTime.TryParse(until,CultureInfo.InvariantCulture,DateTimeStyles.RoundtripKind,out end)||start>end||start.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")!=since||end.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")!=until)throw new Exception("Invalid WHEA range");long recordId=0;
    using(var reader=new EventLogReader(new EventLogQuery("System",PathType.LogName,"*"){ReverseDirection=true})){using(EventRecord latest=reader.ReadEvent()){if(latest==null)throw new Exception("System log unavailable");recordId=latest.RecordId??0;}}
    string filter="*[System[Provider[@Name='Microsoft-Windows-WHEA-Logger'] and TimeCreated[@SystemTime >= '"+since+"' and @SystemTime <= '"+until+"']]]";var events=new List<object>();bool truncated=false;
    using(var reader=new EventLogReader(new EventLogQuery("System",PathType.LogName,filter){ReverseDirection=true})){for(int i=0;i<201;i++){using(EventRecord item=reader.ReadEvent()){if(item==null)break;if(i==200){truncated=true;break;}events.Add(Obj("recordId",item.RecordId??0,"eventId",item.Id,"level",item.Level??0,"time",item.TimeCreated.HasValue?item.TimeCreated.Value.ToUniversalTime().ToString("o"):""));}}}
    return Obj("systemRecordId",recordId,"events",events,"truncated",truncated);
  }
  static object Memory(){
    var cpu=First("SELECT Name FROM Win32_Processor");var board=First("SELECT Manufacturer,Product,Version FROM Win32_BaseBoard");var bios=First("SELECT SMBIOSBIOSVersion FROM Win32_BIOS");
    var modules=new List<object>();foreach(var row in Query(@"root\cimv2","SELECT DeviceLocator,BankLabel,Capacity,Manufacturer,PartNumber,ConfiguredClockSpeed,Speed,SMBIOSMemoryType,ConfiguredVoltage,FormFactor FROM Win32_PhysicalMemory"))modules.Add(Obj("locator",Text(row,"DeviceLocator"),"bank",Text(row,"BankLabel"),"capacityBytes",Number(row,"Capacity"),"manufacturer",Text(row,"Manufacturer"),"partNumber",Text(row,"PartNumber"),"configuredClockMHz",Number(row,"ConfiguredClockSpeed"),"reportedSpeed",Number(row,"Speed"),"smbiosType",Number(row,"SMBIOSMemoryType"),"configuredVoltageMv",Number(row,"ConfiguredVoltage"),"formFactor",Number(row,"FormFactor")));
    return Obj("cpu",Text(cpu,"Name"),"board",Obj("manufacturer",Text(board,"Manufacturer"),"product",Text(board,"Product"),"version",Text(board,"Version")),"bios",Text(bios,"SMBIOSBIOSVersion"),"modules",modules);
  }
  static object ReadDword(string key,string name){using(var item=Registry.LocalMachine.OpenSubKey(key,false)){if(item==null||item.GetValue(name)==null)return Obj("exists",false);if(item.GetValueKind(name)!=RegistryValueKind.DWord)throw new Exception("Unexpected registry type");return Obj("exists",true,"value",unchecked((uint)(int)item.GetValue(name)));}}
  static object Security(){
    object hvci,hags;try{hvci=ReadDword(@"SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity","Enabled");}catch{hvci=Obj("unknown",true);}try{hags=ReadDword(@"SYSTEM\CurrentControlSet\Control\GraphicsDrivers","HwSchMode");}catch{hags=Obj("unknown",true);}
    return Obj("hvci",hvci,"hags",hags,"readOnly",true);
  }
  static Dictionary<string,object> RegistryObservation(RegistryKey root,string keyName,string valueName){
    try{using(RegistryKey key=root.OpenSubKey(keyName,false)){if(key==null||Array.IndexOf(key.GetValueNames(),valueName)<0)return Obj("available",true,"exists",false);RegistryValueKind kind=key.GetValueKind(valueName);if(kind!=RegistryValueKind.DWord)return Obj("available",true,"exists",true,"type",kind.ToString());object raw=key.GetValue(valueName,null,RegistryValueOptions.DoNotExpandEnvironmentNames);if(raw==null)return Obj("available",true,"exists",false);return Obj("available",true,"exists",true,"type","DWord","value",unchecked((uint)Convert.ToInt32(raw,CultureInfo.InvariantCulture)));}}
    catch{return Obj("available",false,"exists",false);}
  }
  static object ExternalAudit(){
    string[] watched={"SysMain","WSearch","DiagTrack","DoSvc","BITS","GamingServices","GamingServicesNet","XblAuthManager","XblGameSave","XboxNetApiSvc","GameInputSvc"};var names=new List<string>();foreach(string name in watched)names.Add("Name='"+name+"'");object services;
    try{string query="SELECT Name,State,StartMode FROM Win32_Service WHERE "+String.Join(" OR ",names.ToArray());var items=new List<object>();foreach(var row in Query(@"root\cimv2",query))items.Add(Obj("name",Text(row,"Name"),"state",Text(row,"State"),"startMode",Text(row,"StartMode")));services=Obj("available",true,"items",items);}
    catch{services=Obj("available",false,"items",new List<object>());}
    return Obj("readOnly",true,"services",services,"registry",Obj(
      "systemResponsiveness",RegistryObservation(Registry.LocalMachine,@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile","SystemResponsiveness"),
      "networkThrottlingIndex",RegistryObservation(Registry.LocalMachine,@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile","NetworkThrottlingIndex"),
      "win32PrioritySeparation",RegistryObservation(Registry.LocalMachine,@"SYSTEM\CurrentControlSet\Control\PriorityControl","Win32PrioritySeparation"),
      "powerThrottlingOff",RegistryObservation(Registry.LocalMachine,@"SYSTEM\CurrentControlSet\Control\Power\PowerThrottling","PowerThrottlingOff"),
      "allowGameDvr",RegistryObservation(Registry.LocalMachine,@"SOFTWARE\Policies\Microsoft\Windows\GameDVR","AllowGameDVR"),
      "autoGameModeEnabled",RegistryObservation(Registry.CurrentUser,@"Software\Microsoft\GameBar","AutoGameModeEnabled"),
      "appCaptureEnabled",RegistryObservation(Registry.CurrentUser,@"Software\Microsoft\Windows\CurrentVersion\GameDVR","AppCaptureEnabled")));
  }
  static object Platform(){
    uint type;bool firmware=GetFirmwareType(out type);PowerStatus power;bool supply=GetSystemPowerStatus(out power);string boot="";
    try{boot=ManagementDateTimeConverter.ToDateTime(Text(First("SELECT LastBootUpTime FROM Win32_OperatingSystem"),"LastBootUpTime")).ToUniversalTime().ToString("o");}catch{}
    return Obj("firmwareType",firmware?type:0,"bootId",boot,"acLine",supply?(int)power.ACLineStatus:255,"batteryFlag",supply?(int)power.BatteryFlag:255);
  }
  static object Gpu(string gameExe){
    if(!Path.IsPathRooted(gameExe)||!gameExe.EndsWith(@"\game\bin\win64\cs2.exe",StringComparison.OrdinalIgnoreCase)||gameExe.Contains(@"\..\"))throw new Exception("Invalid CS2 path");
    using(var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\DirectX\UserGpuPreferences",false)){if(key==null||key.GetValue(gameExe)==null)return Obj("gpuPreference",null);if(key.GetValueKind(gameExe)!=RegistryValueKind.String)throw new Exception("Unexpected GPU preference type");string value=(string)key.GetValue(gameExe);if(value.Length>8192)throw new Exception("GPU preference exceeds limit");foreach(string field in value.Split(';')){string text=field.Trim();if(text.StartsWith("GpuPreference=",StringComparison.OrdinalIgnoreCase)){int preference;if(int.TryParse(text.Substring(14),out preference)&&preference>=0&&preference<=2)return Obj("gpuPreference",preference);}}return Obj("gpuPreference",null);}
  }
  static object Storage(string drive){
    if(drive.Length!=2||drive[0]<'A'||drive[0]>'Z'||drive[1]!=':')throw new Exception("Invalid drive");
    var partitions=Query(@"root\cimv2","ASSOCIATORS OF {Win32_LogicalDisk.DeviceID='"+drive+"'} WHERE AssocClass=Win32_LogicalDiskToPartition");
    if(partitions.Count!=1)return Obj("available",false);
    string partition=Text(partitions[0],"DeviceID").Replace("\\","\\\\").Replace("'","\\'");
    var disks=Query(@"root\cimv2","ASSOCIATORS OF {Win32_DiskPartition.DeviceID='"+partition+"'} WHERE AssocClass=Win32_DiskDriveToDiskPartition");
    if(disks.Count!=1||Text(disks[0],"SerialNumber").Length==0)return Obj("available",false);
    var matches=new List<Dictionary<string,object>>();foreach(var physical in Query(@"root\Microsoft\Windows\Storage","SELECT SerialNumber,Size,MediaType FROM MSFT_PhysicalDisk"))if(Text(physical,"SerialNumber")==Text(disks[0],"SerialNumber")&&Number(physical,"Size")==Number(disks[0],"Size")&&Number(physical,"Size")>0)matches.Add(physical);
    if(matches.Count!=1)return Obj("available",false);long media=Number(matches[0],"MediaType");return Obj("available",media==3||media==4||media==5,"mediaType",media);
  }
  static bool Keys(Dictionary<string,object> request,params string[] expected){if(request.Count!=expected.Length)return false;foreach(string key in expected)if(!request.ContainsKey(key))return false;return true;}
  static int Main(string[] args){Console.OutputEncoding=new UTF8Encoding(false);try{
    if(args.Length!=2||args[0]!="--request"||args[1].Length>8192)throw new Exception("Invalid request");var request=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(Convert.FromBase64String(args[1])));if(request==null||!request.ContainsKey("operation")||!(request["operation"] is string))throw new Exception("Invalid operation");string op=(string)request["operation"];object result;
    switch(op){
      case "memory":case "security":case "platform":case "amdInventory":case "gpuInventory":case "systemInfo":if(!Keys(request,"operation"))throw new Exception("Unknown fields");result=op=="memory"?Memory():op=="security"?Security():op=="platform"?Platform():op=="amdInventory"?AmdInventory():op=="gpuInventory"?GpuInventory():Obj("gpuNames",Query(@"root\cimv2","SELECT Name FROM Win32_VideoController").ConvertAll(row=>Text(row,"Name")));break;
      case "desktopPreference":if(!(request["action"] is string)||!(request["name"] is string)||(Text(request,"action")=="write"?!Keys(request,"operation","action","name","value"):!Keys(request,"operation","action","name")))throw new Exception("Invalid desktop fields");result=DesktopPreference(request);break;
      case "networkInfo":if(!Keys(request,"operation"))throw new Exception("Unknown fields");result=NetworkInfo();break;
      case "discordStatus":if(!Keys(request,"operation"))throw new Exception("Unknown fields");bool discordRunning=false;foreach(string name in new[]{"Discord","DiscordCanary","DiscordPTB"})foreach(var process in Process.GetProcessesByName(name)){using(process){discordRunning=true;}}result=Obj("running",discordRunning);break;
      case "browserInventory":if(!Keys(request,"operation"))throw new Exception("Unknown fields");result=BrowserInventory();break;
      case "externalAudit":if(!Keys(request,"operation"))throw new Exception("Unknown fields");result=ExternalAudit();break;
      case "storage":if(!Keys(request,"operation","drive")||!(request["drive"] is string))throw new Exception("Unknown fields");result=Storage((string)request["drive"]);break;
      case "gpu":if(!Keys(request,"operation","gameExe")||!(request["gameExe"] is string))throw new Exception("Unknown fields");result=Gpu((string)request["gameExe"]);break;
      case "registry":{object actionRaw;if(!request.TryGetValue("action",out actionRaw)||!(actionRaw is string))throw new Exception("Invalid registry action");string action=(string)actionRaw;if(action=="write"?!Keys(request,"operation","action","key","name","value"):!Keys(request,"operation","action","key","name"))throw new Exception("Unknown fields");if(!(request["key"] is string)||!(request["name"] is string))throw new Exception("Invalid registry target");if(action=="write"){if(!(request["value"] is Dictionary<string,object>))throw new Exception("Invalid registry value");var value=(Dictionary<string,object>)request["value"];if(!Keys(value,"type","data"))throw new Exception("Unknown registry fields");}result=RegistryOperation(request);break;}
      case "reparseCheck":if(!Keys(request,"operation","path","recursive")||!(request["path"] is string)||!(request["recursive"] is bool))throw new Exception("Unknown fields");result=Obj("ok",CheckPath((string)request["path"],(bool)request["recursive"]));break;
      case "amdEvents":if(!Keys(request,"operation","since","until")||!(request["since"] is string)||!(request["until"] is string))throw new Exception("Unknown fields");result=AmdEvents((string)request["since"],(string)request["until"]);break;
      default:throw new Exception("Unknown operation");
    }Console.WriteLine(Json.Serialize(Obj("ok",true,"value",result)));return 0;
  }catch(Exception error){Console.WriteLine(Json.Serialize(Obj("ok",false,"error",error.Message)));return 1;}}
}
