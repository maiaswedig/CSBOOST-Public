using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Own app lifetime guard. Holds a kernel mutex until recovery has finished.
// No service, driver, scheduling hook, arbitrary executable or script command.
internal static class RecoveryGuard {
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  static void Emit(object value){Console.WriteLine(Json.Serialize(value));Console.Out.Flush();}
  static string Full(string value){return Path.GetFullPath(value).TrimEnd(Path.DirectorySeparatorChar);}
  static void Regular(string file){var flags=File.GetAttributes(file);if((flags&(FileAttributes.ReparsePoint|FileAttributes.Directory))!=0)throw new Exception("Invalid application file");}
  static int Main(string[] args){
    try{
      Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});
      Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false)));
      int parentId;if(args.Length!=2||!int.TryParse(args[0],out parentId)||parentId<1)throw new Exception("Invalid parent");
      string directory=Full(Encoding.UTF8.GetString(Convert.FromBase64String(args[1])));
      if(!Directory.Exists(directory)||(File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0)throw new Exception("Invalid recovery directory");
      string ownDirectory=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
      string entry=Full(Path.Combine(ownDirectory,"..","recovery-entry.mjs"));
      string executable=Full(Path.Combine(ownDirectory,"..","..","..","CSBOOST.exe"));
      Regular(entry);Regular(executable);
      using(Process parent=Process.GetProcessById(parentId)){
        // Open the original process handle before announcing readiness. PID reuse
        // later cannot switch this handle to a different application.
        IntPtr parentHandle=parent.Handle;
        if(parent.SessionId!=Process.GetCurrentProcess().SessionId||!String.Equals(Full(parent.MainModule.FileName),executable,StringComparison.OrdinalIgnoreCase))throw new Exception("Parent outside application");
        string digest;using(var sha=SHA256.Create()){digest=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(directory.ToUpperInvariant()))).Replace("-","");}
        using(var mutex=new Mutex(false,"Local\\CSBOOST-Recovery-"+digest)){
          bool acquired=false;try{
            try{acquired=mutex.WaitOne(120000);}catch(AbandonedMutexException){acquired=true;}
            if(!acquired)throw new Exception("Previous recovery is still running");
            Emit(new {status="ready"});
            // Only the owning main process has the write end of this pipe.
            string disposition=Console.In.ReadLine();parent.WaitForExit();
            if(disposition=="CLEAN")return 0;
            var start=new ProcessStartInfo(executable,"\""+entry+"\" --data "+Convert.ToBase64String(Encoding.UTF8.GetBytes(directory)));
            start.UseShellExecute=false;start.CreateNoWindow=true;start.WindowStyle=ProcessWindowStyle.Hidden;
            start.EnvironmentVariables.Remove("NODE_OPTIONS");start.EnvironmentVariables.Remove("NODE_PATH");
            start.EnvironmentVariables["ELECTRON_RUN_AS_NODE"]="1";
            using(Process recovery=Process.Start(start)){recovery.WaitForExit();return recovery.ExitCode;}
          }finally{if(acquired)mutex.ReleaseMutex();}
        }
      }
    }catch(Exception error){try{Emit(new {status="error",error=error.Message});}catch{}return 1;}
  }
}
