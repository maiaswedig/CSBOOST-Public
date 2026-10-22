using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

// Owns only the pinned console child. No game handles, injection or configuration setters.
internal static class FrameWorker {
  const string Hash="364e5d98d4d134bd54dd25c22ed2ca2f4883f8bc3ed6502bee0c151e3436d30c";
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=32768};
  static readonly object WriteLock=new object();
  [StructLayout(LayoutKind.Sequential)] struct IoCounters {public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount;}
  [StructLayout(LayoutKind.Sequential)] struct BasicLimit {public long PerProcessUserTimeLimit,PerJobUserTimeLimit;public uint LimitFlags;public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass;}
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimit {public BasicLimit BasicLimitInformation;public IoCounters IoInfo;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimit value,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static Dictionary<string,object> Obj(params object[] fields){var v=new Dictionary<string,object>();for(int i=0;i<fields.Length;i+=2)v.Add((string)fields[i],fields[i+1]);return v;}
  static void Emit(object value){try{lock(WriteLock)Console.WriteLine(Json.Serialize(value));}catch{}}
  static string Digest(string file){using(var input=File.OpenRead(file))using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();}
  static object Permission(int parentPid){using(var identity=WindowsIdentity.GetCurrent())using(var parent=Process.GetProcessById(parentPid)){var principal=new WindowsPrincipal(identity);bool admin=principal.IsInRole(WindowsBuiltInRole.Administrator),logs=principal.IsInRole(new SecurityIdentifier("S-1-5-32-559"));return Obj("allowed",admin||logs,"administrator",admin,"performanceLogUser",logs,"parentStartTicks",parent.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture));}}
  static string Quote(string value){if(value.IndexOf('"')>=0||value.IndexOf('\0')>=0||value.EndsWith("\\"))throw new Exception("Invalid argument");return "\""+value+"\"";}
  static void EndTrace(string exe,string session){using(var stop=Process.Start(new ProcessStartInfo(exe,"--session_name "+session+" --terminate_existing_session"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true})){var output=new StringBuilder();object gate=new object();DataReceivedEventHandler read=(s,e)=>{if(e.Data!=null)lock(gate){if(output.Length<8192)output.AppendLine(e.Data);}};stop.OutputDataReceived+=read;stop.ErrorDataReceived+=read;stop.BeginOutputReadLine();stop.BeginErrorReadLine();if(!stop.WaitForExit(5000)){stop.Kill();stop.WaitForExit(1000);throw new Exception("ETW shutdown timed out");}stop.WaitForExit();if(stop.ExitCode!=0&&!(stop.ExitCode==7&&output.ToString().Contains("no existing sessions found: "+session)))throw new Exception("ETW shutdown was not confirmed: "+stop.ExitCode);}}
  static int Capture(Dictionary<string,object> req){
    if(req.Count!=6)throw new Exception("Invalid capture fields");
    string id=(string)req["id"],exe=Path.GetFullPath((string)req["exe"]),output=Path.GetFullPath((string)req["output"]),parentTicks=(string)req["parentStartTicks"];
    Guid guid;if(!Guid.TryParseExact(id,"D",out guid)||Path.GetFileName(output)!=id+".csv"||new DirectoryInfo(Path.GetDirectoryName(output)).Name!="captures"||Path.GetFileName(exe)!="PresentMon-2.3.1-x64.exe"||Digest(exe)!=Hash)throw new Exception("Unverified capture target");
    int parentPid=Convert.ToInt32(req["parentPid"]),seconds=Convert.ToInt32(req["seconds"]);if(seconds<1||seconds>360)throw new Exception("Invalid capture duration");
    var permission=(Dictionary<string,object>)Permission(parentPid);if(!(bool)permission["allowed"]||(string)permission["parentStartTicks"]!=parentTicks)throw new Exception("Capture permission or parent identity changed");
    string session="csboost-"+id,tail="";object tailLock=new object();Process child=null;IntPtr job=IntPtr.Zero;var clock=Stopwatch.StartNew();long peak=0;double cpu=0;int samples=0;string reason="collector-exit";
    using(var parent=Process.GetProcessById(parentPid))try{
      if(parent.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture)!=parentTicks)throw new Exception("Parent identity changed");
      job=CreateJobObject(IntPtr.Zero,null);var limits=new ExtendedLimit();limits.BasicLimitInformation.LimitFlags=0x2000;
      if(job==IntPtr.Zero||!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimit))))throw new Exception("Could not create collector containment");
      // Join before creation: child inherits the job, eliminating the Start/Assign orphan window.
      // The job handle stays open until this supervisor exits; closing it here would kill self.
      using(var self=Process.GetCurrentProcess())if(!AssignProcessToJobObject(job,self.Handle))throw new Exception("Could not contain collector supervisor");
      child=new Process {StartInfo=new ProcessStartInfo(exe,"--process_name cs2.exe --output_file "+Quote(output)+" --session_name "+session+" --stop_existing_session --timed "+seconds+" --terminate_after_timed --terminate_on_proc_exit --no_console_stats"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true}};
      DataReceivedEventHandler read=(s,e)=>{if(e.Data!=null)lock(tailLock){tail=(tail+e.Data+"\n");if(tail.Length>8192)tail=tail.Substring(tail.Length-8192);}};
      child.OutputDataReceived+=read;child.ErrorDataReceived+=read;
      if(!child.Start())throw new Exception("Could not start collector");
      child.BeginOutputReadLine();child.BeginErrorReadLine();Emit(Obj("event","ready","pid",child.Id));
      var input=Task.Factory.StartNew(()=>Console.ReadLine());
      while(!child.WaitForExit(250)){
        child.Refresh();peak=Math.Max(peak,child.WorkingSet64);cpu=child.TotalProcessorTime.TotalMilliseconds;samples++;
        if(parent.HasExited){reason="parent-exit";break;}
        if(input.IsCompleted){reason="stop-request";break;}
        if(clock.Elapsed.TotalSeconds>seconds+10){reason="watchdog";break;}
      }
      EndTrace(exe,session);if(!child.WaitForExit(3000)){child.Kill();child.WaitForExit(2000);}
      try{cpu=child.TotalProcessorTime.TotalMilliseconds;peak=Math.Max(peak,child.PeakWorkingSet64);}catch{}
      Emit(Obj("event","finished","reason",reason,"exitCode",child.ExitCode,"outputTail",tail,"overhead",Obj("collectorCpuMs",cpu,"collectorPeakWorkingSetBytes",peak,"wallMs",clock.Elapsed.TotalMilliseconds,"samples",samples,"method","Process.TotalProcessorTime/PeakWorkingSet64; collector only, no FPS overhead inference")));
      return 0;
    }finally{
      try{if(child!=null&&!child.HasExited){EndTrace(exe,session);if(!child.WaitForExit(2000))child.Kill();}}catch{}
      if(child!=null)child.Dispose();
    }
  }
  static int Main(string[] args){Console.OutputEncoding=new UTF8Encoding(false);try{
    if(args.Length==2&&args[0]=="--status"){int pid;if(!int.TryParse(args[1],out pid)||pid<=0)throw new Exception("Invalid parent");Emit(Obj("ok",true,"value",Permission(pid)));return 0;}
    if(args.Length!=2||args[0]!="--capture"||args[1].Length>16384)throw new Exception("Invalid request");
    return Capture(Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(Convert.FromBase64String(args[1]))));
  }catch(Exception error){Emit(Obj("event","error","error",error.Message));return 1;}}
}
