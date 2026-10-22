using System;
using System.Collections.Generic;

internal static class TopologyParserFixtures {
  static int passed;
  static void W32(byte[] b,int p,uint n){Array.Copy(BitConverter.GetBytes(n),0,b,p,4);}
  static void W16(byte[] b,int p,ushort n){Array.Copy(BitConverter.GetBytes(n),0,b,p,2);}
  static byte[] Cpu(int size=32,uint type=0){var b=new byte[size];W32(b,0,(uint)size);W32(b,4,type);if(size>=32){W32(b,8,257);b[14]=3;b[15]=1;b[16]=2;b[18]=7;b[19]=15;}return b;}
  static byte[] Cache(int size=56,ushort count=1,uint relation=2){var b=new byte[size];W32(b,0,relation);W32(b,4,(uint)size);if(size>=56){b[8]=3;W32(b,12,33554432);W16(b,38,count);Array.Copy(BitConverter.GetBytes((ulong)15),0,b,40,8);}return b;}
  static byte[] Join(byte[] a,byte[] b){var c=new byte[a.Length+b.Length];a.CopyTo(c,0);b.CopyTo(c,a.Length);return c;}
  static void Ok(bool value){if(!value)throw new Exception("Fixture assertion failed");passed++;}
  static void Reject(Action action){try{action();}catch(InvalidOperationException){passed++;return;}throw new Exception("Malformed record accepted");}
  static int Main(){
    try{
      var rows=TopologyWorker.ParseCpuSets(Cpu());var row=(Dictionary<string,object>)rows[0];Ok(rows.Count==1&&(uint)row["id"]==257&&(bool)row["parked"]&&(bool)row["allocated"]&&(bool)row["allocatedToTargetProcess"]&&(bool)row["realTime"]);
      Ok(TopologyWorker.ParseCpuSets(Cpu(40)).Count==1);
      Ok(TopologyWorker.ParseCpuSets(Join(Cpu(8,99),Cpu())).Count==1);
      Ok(TopologyWorker.ParseCpuSets(new byte[0]).Count==0);
      Reject(()=>TopologyWorker.ParseCpuSets(new byte[7]));
      var b=Cpu();W32(b,0,0);Reject(()=>TopologyWorker.ParseCpuSets(b));
      b=Cpu();W32(b,0,33);Reject(()=>TopologyWorker.ParseCpuSets(b));
      Reject(()=>TopologyWorker.ParseCpuSets(Cpu(24)));
      Reject(()=>TopologyWorker.ParseCpuSets(Join(Cpu(),new byte[1])));
      Ok(TopologyWorker.ParseCaches(Cache()).Count==1);
      Ok(TopologyWorker.ParseCaches(Cache(56,0)).Count==1);
      Ok(TopologyWorker.ParseCaches(Join(Cache(8,1,999),Cache())).Count==1);
      var c=Cache();c[8]=2;Ok(TopologyWorker.ParseCaches(c).Count==0);
      Reject(()=>TopologyWorker.ParseCaches(new byte[7]));
      c=Cache();W32(c,4,0);Reject(()=>TopologyWorker.ParseCaches(c));
      c=Cache();W32(c,4,57);Reject(()=>TopologyWorker.ParseCaches(c));
      Reject(()=>TopologyWorker.ParseCaches(Cache(48)));
      Reject(()=>TopologyWorker.ParseCaches(Cache(56,2)));
      Reject(()=>TopologyWorker.ParseCaches(Cache(64,0)));
      c=Cache();Array.Clear(c,40,8);Reject(()=>TopologyWorker.ParseCaches(c));
      Console.WriteLine("Topology parser fixtures: "+passed+" passed");return 0;
    }catch(Exception error){Console.Error.WriteLine(error);return 1;}
  }
}
