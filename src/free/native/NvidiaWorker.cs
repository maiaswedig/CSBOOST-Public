// Independent CSBOOST NVAPI DRS interop; no CSCLIENT implementation or native module.
// API ABI and constants checked against NVIDIA/nvapi commit
// 70d337db9186e968eab622f7e786de7e437faf3d (MIT), 2026-10-14.
// NVDRS_SETTING_V1 has pack=4, two 4100-byte unions, and 2048 UTF-16 chars.
// This worker deliberately exposes no global-profile, clocks, or arbitrary setting API.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal sealed class NvidiaWorker
{
    const string Application = "cs2.exe";
    const string OwnProfile = "CSBOOST - Counter-Strike 2";
    static readonly uint[] Ids = { 0x1057EB71, 0x0064B541, 0x00A879CF, 0x00CE2691, 0x00E73211, 0x0084CD70, 0x002ECAF2, 0x00198FFF, 0x1074c972, 0x98c1ac, 0x107efc5b, 0x10d2bb16, 0x667329, 0x107d639d, 0x10fc2d9c, 0x0019bb68, 0x20c1221e, 0x20d690f8, 0x20fdd1f9, 0x007ba09e };
    static readonly Dictionary<uint, uint> RecommendedSettings = new Dictionary<uint, uint>
    {
        { 0x1057EB71, 1 }, { 0x0064B541, 1 }, { 0x00CE2691, 20 },
        { 0x00E73211, 1 }, { 0x0084CD70, 1 }, { 0x002ECAF2, 1 },
        { 0x1074c972, 0 }, { 0x98c1ac, 0 }, { 0x107efc5b, 0 },
        { 0x10d2bb16, 0 }, { 0x667329, 0 }, { 0x107d639d, 0 },
        { 0x10fc2d9c, 0 }, { 0x0019bb68, 0 }, { 0x20c1221e, 0 },
        { 0x20d690f8, 2 }, { 0x20fdd1f9, 0 }, { 0x007ba09e, 1 }
    };
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 65536, RecursionLimit = 32 };
    static Dictionary<string, object> Obj(params object[] pairs)
    {
        var result = new Dictionary<string, object>();
        for (int i = 0; i < pairs.Length; i += 2) result.Add((string)pairs[i], pairs[i + 1]);
        return result;
    }
    static Dictionary<string, object> Map(object value)
    {
        var map = value as Dictionary<string, object>;
        if (map == null) throw new InvalidOperationException("Objeto NVAPI inválido.");
        return map;
    }
    static object Field(Dictionary<string, object> value, string name)
    {
        object result;
        if (!value.TryGetValue(name, out result)) throw new InvalidOperationException("Campo NVAPI ausente: " + name);
        return result;
    }
    static string Text(object value)
    {
        var result = value as string;
        if (result == null || result.Length > 2048) throw new InvalidOperationException("Texto NVAPI inválido.");
        return result;
    }
    static uint Number(object value)
    {
        if (!(value is int || value is long || value is uint || value is decimal)) throw new InvalidOperationException("Número NVAPI inválido.");
        decimal number = Convert.ToDecimal(value);
        if (number < 0 || number > uint.MaxValue || decimal.Truncate(number) != number) throw new InvalidOperationException("Número NVAPI fora dos limites.");
        return (uint)number;
    }
    static bool Flag(object value)
    {
        if (!(value is bool)) throw new InvalidOperationException("Indicador NVAPI inválido.");
        return (bool)value;
    }
    static List<Dictionary<string, object>> Maps(object value)
    {
        var array = value as IEnumerable;
        if (array == null || value is string || value is Dictionary<string, object>) throw new InvalidOperationException("Lista NVAPI inválida.");
        return array.Cast<object>().Select(Map).ToList();
    }
    static Dictionary<string, object> Setting(Dictionary<string, object> snapshot, uint id)
    {
        var entries = Maps(Field(snapshot, "settings"));
        if (entries.Count != Ids.Length || entries.Select(x => Number(Field(x, "id"))).Distinct().Count() != Ids.Length || entries.Any(x => !Ids.Contains(Number(Field(x, "id"))))) throw new InvalidOperationException("Inventário NVAPI inválido.");
        return entries.Single(x => Number(Field(x, "id")) == id);
    }
    static bool SameSetting(Dictionary<string, object> a, Dictionary<string, object> b)
    {
        if (Flag(Field(a, "recognized")) != Flag(Field(b, "recognized"))) return false;
        if (Flag(Field(a, "exists")) != Flag(Field(b, "exists"))) return false;
        if (!Flag(Field(a, "exists"))) return true;
        return Number(Field(a, "type")) == Number(Field(b, "type")) && Number(Field(a, "value")) == Number(Field(b, "value")) && Number(Field(a, "location")) == Number(Field(b, "location")) && Flag(Field(a, "userOverride")) == Flag(Field(b, "userOverride"));
    }
    static bool RestoredSetting(Dictionary<string, object> current, Dictionary<string, object> before)
    {
        if (!Flag(Field(before, "userOverride"))) return !Flag(Field(current, "userOverride"));
        return Flag(Field(current, "userOverride")) && Number(Field(current, "value")) == Number(Field(before, "value"));
    }
    static string[] Applications(Dictionary<string, object> profile)
    {
        var values = Field(profile, "applications") as IEnumerable;
        if (values == null || values is string) throw new InvalidOperationException("Aplicações NVAPI inválidas.");
        return values.Cast<object>().Select(Text).OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
    }
    static bool SameProfile(Dictionary<string, object> a, Dictionary<string, object> b)
    {
        if (Flag(Field(a, "exists")) != Flag(Field(b, "exists"))) return false;
        if (!Flag(Field(a, "exists"))) return true;
        return Text(Field(a, "name")) == Text(Field(b, "name")) && Flag(Field(a, "predefined")) == Flag(Field(b, "predefined")) && Applications(a).SequenceEqual(Applications(b), StringComparer.OrdinalIgnoreCase);
    }
    static void EnsureExclusive(Dictionary<string, object> profile)
    {
        if (!Flag(Field(profile, "exists"))) return;
        string[] apps = Applications(profile);
        bool officialCs2 = Flag(Field(profile, "predefined")) && String.Equals(Text(Field(profile, "name")), "Counter-strike 2", StringComparison.OrdinalIgnoreCase);
        if (apps.Length == 0 || !apps.Any(x => String.Equals(x, Application, StringComparison.OrdinalIgnoreCase)) || apps.Any(x => !String.Equals(x, Application, StringComparison.OrdinalIgnoreCase) && !(officialCs2 && String.Equals(x, "csgos2.exe", StringComparison.OrdinalIgnoreCase)))) throw new InvalidOperationException("O perfil NVIDIA inclui executáveis fora do perfil CS2 permitido. O CSBOOST não altera esse perfil compartilhado.");
    }
    static void EnsureClosed()
    {
        var processes = Process.GetProcessesByName("cs2");
        try { if (processes.Length != 0) throw new InvalidOperationException("Feche o CS2 antes de alterar o perfil NVIDIA."); }
        finally { foreach (var process in processes) process.Dispose(); }
    }
    static void EnsureExpected(Dictionary<string, object> current, Dictionary<string, object> expected)
    {
        if (Text(Field(expected, "application")) != Application || Number(Field(current, "driverVersion")) != Number(Field(expected, "driverVersion")) || !SameProfile(Map(Field(current, "profile")), Map(Field(expected, "profile")))) throw new InvalidOperationException("Conflito: o perfil NVIDIA mudou desde a prévia.");
        foreach (uint id in Ids) if (!SameSetting(Setting(current, id), Setting(expected, id))) throw new InvalidOperationException("Conflito: uma configuração NVIDIA mudou desde a prévia.");
    }
    static List<Dictionary<string, object>> Desired(object value, string preset)
    {
        if (!new[] { "performance", "competitive", "texture", "custom", "recommended" }.Contains(preset)) throw new InvalidOperationException("Preset NVIDIA inválido.");
        var entries = Maps(value);
        if (entries.Count > Ids.Length || entries.Select(x => Number(Field(x, "id"))).Distinct().Count() != entries.Count) throw new InvalidOperationException("Ajustes NVIDIA duplicados ou excessivos.");
        foreach (var entry in entries)
        {
            uint id = Number(Field(entry, "id")), settingValue = Number(Field(entry, "value"));
            uint recommendedValue;
            // Granular selections use the same fixed values as presets, including custom.
            // Ultra remains explicit in the JavaScript plan; no arbitrary IDs/values enter DRS.
            bool allowed = (RecommendedSettings.TryGetValue(id, out recommendedValue) && settingValue == recommendedValue)
                || (id == Ids[2] && settingValue == 0x08416747)
                || (id == Ids[7] && settingValue == 1)
                || (id == 0x007ba09e && settingValue == 2);
            if (!allowed) throw new InvalidOperationException("Ajuste NVIDIA não autorizado pelo catálogo CSBOOST.");
        }
        return entries;
    }
    static object Execute(Dictionary<string, object> request)
    {
        string operation = Text(Field(request, "operation"));
        if (!new[] { "read", "apply", "restore" }.Contains(operation)) throw new InvalidOperationException("Operação NVIDIA inválida.");
        using (var api = new NvApi())
        {
            Dictionary<string, object> current = api.Read();
            if (operation == "read") return current;
            EnsureClosed();
            var before = Map(Field(request, "before"));
            if (Text(Field(before, "application")) != Application) throw new InvalidOperationException("Aplicação NVIDIA inválida.");
            string preset = Text(Field(request, "preset"));
            if (preset != "performance" && preset != "competitive" && preset != "texture" && preset != "custom" && preset != "recommended") throw new InvalidOperationException("Preset NVIDIA inválido.");
            var desired = Desired(Field(request, "settings"), preset);
            var profile = Map(Field(current, "profile"));
            var originalProfile = Map(Field(before, "profile"));
            if (operation == "apply")
            {
                EnsureExclusive(profile);
                EnsureExclusive(originalProfile);
                EnsureExpected(current, before);
                foreach (var entry in desired)
                {
                    var prior = Setting(before, Number(Field(entry, "id")));
                    if (Ids.Skip(8).Where(id => id != 0x007ba09e).Contains(Number(Field(entry, "id"))) && !Flag(Field(prior, "exists"))) throw new InvalidOperationException("Efeito ativo não confirmado.");
                    if (Number(Field(entry, "id")) == 0x00198FFF && (!Flag(Field(prior, "exists")) || Number(Field(prior, "value")) != 0)) throw new InvalidOperationException("Cache de shaders desligado não confirmado.");
                    if (!Flag(Field(prior, "recognized"))) throw new InvalidOperationException("O driver NVIDIA não reconhece esse ajuste público.");
                    if (Flag(Field(prior, "exists")) && Number(Field(prior, "type")) != 0) throw new InvalidOperationException("O ajuste NVIDIA não é DWORD.");
                }
                if (desired.Count == 0) return Obj("after", current, "changed", false);
                IntPtr handle = api.Resolve(true);
                foreach (var entry in desired) api.Set(handle, Number(Field(entry, "id")), Number(Field(entry, "value")));
                EnsureClosed();
                api.Save();
                var after = api.ReloadRead();
                foreach (var entry in desired)
                {
                    var actual = Setting(after, Number(Field(entry, "id")));
                    if (!Flag(Field(actual, "userOverride")) || Number(Field(actual, "value")) != Number(Field(entry, "value"))) throw new InvalidOperationException("O driver não confirmou o ajuste NVIDIA. A recuperação permanece pendente.");
                }
                return Obj("after", after, "changed", true);
            }
            if (!Flag(Field(originalProfile, "exists")))
            {
                if (!Flag(Field(profile, "exists"))) return Obj("after", current, "changed", false);
                if (Text(Field(profile, "name")) != OwnProfile || Flag(Field(profile, "predefined"))) return Obj("after", current, "changed", false, "conflicts", new List<string> { "profile" });
                var local = api.LocalSettings(api.Resolve(false));
                if (local.Count != desired.Count || local.Any(x => !desired.Any(d => Number(Field(d, "id")) == x.Key && Number(Field(d, "value")) == x.Value))) return Obj("after", current, "changed", false, "conflicts", new List<string> { "profile" });
                api.Delete(api.Resolve(false));
                EnsureClosed();
                api.Save();
                var after = api.ReloadRead();
                if (Flag(Field(Map(Field(after, "profile")), "exists"))) throw new InvalidOperationException("O driver não confirmou a remoção do perfil CSBOOST.");
                return Obj("after", after, "changed", true);
            }
            if (!SameProfile(profile, originalProfile)) return Obj("after", current, "changed", false, "conflicts", new List<string> { "profile" });
            // Restore settings still owned by CSBOOST and retain only conflicts.
            var conflicts = new List<uint>();
            foreach (var entry in desired)
            {
                uint id = Number(Field(entry, "id"));
                var actual = Setting(current, id);
                if (RestoredSetting(actual, Setting(before, id))) continue;
                if (!Flag(Field(actual, "userOverride")) || Number(Field(actual, "value")) != Number(Field(entry, "value"))) conflicts.Add(id);
            }
            var restorable = desired.Where(entry => !conflicts.Contains(Number(Field(entry, "id"))) && !RestoredSetting(Setting(current, Number(Field(entry, "id"))), Setting(before, Number(Field(entry, "id"))))).ToList();
            if (restorable.Count == 0) return Obj("after", current, "changed", false, "conflicts", conflicts);
            IntPtr originalHandle = api.Resolve(false);
            foreach (var entry in restorable)
            {
                uint id = Number(Field(entry, "id"));
                var prior = Setting(before, id);
                if (RestoredSetting(Setting(current, id), prior)) continue;
                if (Flag(Field(prior, "userOverride"))) api.Set(originalHandle, id, Number(Field(prior, "value")));
                else api.DeleteSetting(originalHandle, id);
            }
            EnsureClosed();
            api.Save();
            var restored = api.ReloadRead();
            foreach (var entry in restorable) if (!RestoredSetting(Setting(restored, Number(Field(entry, "id"))), Setting(before, Number(Field(entry, "id"))))) throw new InvalidOperationException("O driver não confirmou a restauração NVIDIA.");
            return Obj("after", restored, "changed", true, "conflicts", conflicts);
        }
    }
    public static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        bool locked = false;
        using (var mutex = new Mutex(false, "Local\\CSBOOST.NVAPI.CS2"))
        {
            try
            {
                if (args.Length != 2 || args[0] != "--request" || args[1].Length > 88000) throw new InvalidOperationException("Protocolo NVIDIA inválido.");
                byte[] bytes = Convert.FromBase64String(args[1]);
                if (bytes.Length > 65536) throw new InvalidOperationException("Solicitação NVIDIA excessiva.");
                var request = Map(Json.DeserializeObject(new UTF8Encoding(false, true).GetString(bytes)));
                try { locked = mutex.WaitOne(15000); } catch (AbandonedMutexException) { locked = true; }
                if (!locked) throw new InvalidOperationException("O driver NVIDIA já está sendo usado pelo CSBOOST.");
                Console.WriteLine(Json.Serialize(Obj("ok", true, "value", Execute(request))));
            }
            catch (Exception error)
            {
                Console.WriteLine(Json.Serialize(Obj("ok", false, "error", error.Message)));
            }
            finally { if (locked) mutex.ReleaseMutex(); }
        }
        return 0;
    }

    sealed class NvApi : IDisposable
    {
        const int SettingSize = 12320, AppSize = 12296, ProfileSize = 4116;
        IntPtr library, session;
        Query query;
        bool initialized;
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)] static extern IntPtr GetProcAddress(IntPtr module, string name);
        [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr Query(uint id);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Simple();
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Create(out IntPtr handle);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int SessionCall(IntPtr handle);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Driver(out uint version, StringBuilder branch);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FindApp(IntPtr s, [MarshalAs(UnmanagedType.LPWStr)] string name, out IntPtr p, IntPtr app);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int FindProfile(IntPtr s, [MarshalAs(UnmanagedType.LPWStr)] string name, out IntPtr p);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Info(IntPtr s, IntPtr p, IntPtr data);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int CreateProfile(IntPtr s, IntPtr data, out IntPtr p);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DeleteProfile(IntPtr s, IntPtr p);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int GetSetting(IntPtr s, IntPtr p, uint id, IntPtr data);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int DeleteSettingCall(IntPtr s, IntPtr p, uint id);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int EnumItems(IntPtr s, IntPtr p, uint start, ref uint count, IntPtr data);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int AvailableIds(IntPtr data, ref uint count);
        T Function<T>(uint id) where T : class
        {
            IntPtr address = query(id);
            if (address == IntPtr.Zero) throw new InvalidOperationException("O driver não oferece a API NVIDIA necessária.");
            return Marshal.GetDelegateForFunctionPointer(address, typeof(T)) as T;
        }
        static void Check(int status, string operation)
        {
            if (status != 0) throw new InvalidOperationException(operation + " falhou (NVAPI " + status + ").");
        }
        static IntPtr Buffer(int size, uint revision)
        {
            IntPtr pointer = Marshal.AllocHGlobal(size);
            Marshal.Copy(new byte[size], 0, pointer, size);
            Marshal.WriteInt32(pointer, unchecked((int)((uint)size | (revision << 16))));
            return pointer;
        }
        static uint U32(IntPtr buffer, int offset) { return unchecked((uint)Marshal.ReadInt32(buffer, offset)); }
        static void W32(IntPtr buffer, int offset, uint value) { Marshal.WriteInt32(buffer, offset, unchecked((int)value)); }
        static void Unicode(IntPtr buffer, int offset, string text)
        {
            if (text.Length >= 2048) throw new InvalidOperationException("Nome NVIDIA excessivo.");
            byte[] bytes = Encoding.Unicode.GetBytes(text + "\0");
            Marshal.Copy(bytes, 0, IntPtr.Add(buffer, offset), bytes.Length);
        }
        public NvApi()
        {
            try
            {
                if (!Environment.Is64BitProcess) throw new InvalidOperationException("O worker NVIDIA exige Windows de 64 bits.");
                string dll = Path.Combine(Environment.SystemDirectory, "nvapi64.dll");
                library = LoadLibraryEx(dll, IntPtr.Zero, 0x00000100 | 0x00000800); // DLL directory + System32 dependencies only.
                if (library == IntPtr.Zero) throw new InvalidOperationException("NVAPI não está disponível. É necessário um driver NVIDIA instalado.");
                IntPtr entry = GetProcAddress(library, "nvapi_QueryInterface");
                if (entry == IntPtr.Zero) throw new InvalidOperationException("Interface NVAPI não encontrada no driver NVIDIA.");
                query = (Query)Marshal.GetDelegateForFunctionPointer(entry, typeof(Query));
                Check(Function<Simple>(0x0150e828)(), "NvAPI_Initialize"); initialized = true;
                Check(Function<Create>(0x0694d52e)(out session), "DRS_CreateSession");
                Check(Function<SessionCall>(0x375dbd6b)(session), "DRS_LoadSettings");
            }
            catch { Dispose(); throw; }
        }
        public IntPtr Resolve(bool create)
        {
            IntPtr app = Buffer(AppSize, 1), profile;
            try
            {
                int status = Function<FindApp>(0xeee566b2)(session, Application, out profile, app);
                if (status == 0)
                {
                    if (profile == IntPtr.Zero || profile.ToInt64() == -1) throw new InvalidOperationException("O perfil NVIDIA do CS2 não pode ser global.");
                    return profile;
                }
                if (status != -166) Check(status, "DRS_FindApplicationByName");
                if (!create) return IntPtr.Zero;
                IntPtr existing;
                int found = Function<FindProfile>(0x7e4a9a0b)(session, OwnProfile, out existing);
                if (found == 0) throw new InvalidOperationException("Já existe um perfil CSBOOST não associado ao CS2; não será sobrescrito.");
                if (found != -163) Check(found, "DRS_FindProfileByName");
                IntPtr info = Buffer(ProfileSize, 1);
                try { Unicode(info, 4, OwnProfile); Check(Function<CreateProfile>(0xcc176068)(session, info, out profile), "DRS_CreateProfile"); }
                finally { Marshal.FreeHGlobal(info); }
                Unicode(app, 8, Application); Unicode(app, 4104, "Counter-Strike 2");
                Check(Function<Info>(0x4347a9de)(session, profile, app), "DRS_CreateApplication");
                return profile;
            }
            finally { Marshal.FreeHGlobal(app); }
        }
        HashSet<uint> RecognizedIds()
        {
            const int maximum = 8192;
            IntPtr buffer = Marshal.AllocHGlobal(maximum * 4);
            try
            {
                uint count = maximum;
                Check(Function<AvailableIds>(0xf020614a)(buffer, ref count), "DRS_EnumAvailableSettingIds");
                if (count > maximum) throw new InvalidOperationException("Catálogo NVIDIA excessivo.");
                var result = new HashSet<uint>();
                for (int i = 0; i < count; i++) result.Add(U32(buffer, i * 4));
                return result;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        Dictionary<string, object> ReadSetting(IntPtr profile, uint id, bool recognized)
        {
            if (profile == IntPtr.Zero || !recognized) return Obj("id", id, "recognized", recognized, "exists", false, "type", 0, "value", 0, "location", 3, "predefined", false, "userOverride", false);
            IntPtr buffer = Buffer(SettingSize, 1);
            try
            {
                int status = Function<GetSetting>(0x73bf8338)(session, profile, id, buffer);
                if (status == -160) return Obj("id", id, "recognized", recognized, "exists", false, "type", 0, "value", 0, "location", 3, "predefined", false, "userOverride", false);
                Check(status, "DRS_GetSetting");
                uint type = U32(buffer, 4104), location = U32(buffer, 4108);
                bool predefined = U32(buffer, 4112) != 0;
                if (type != 0) throw new InvalidOperationException("Tipo NVIDIA inesperado em configuração DWORD.");
                return Obj("id", id, "recognized", recognized, "exists", true, "type", type, "value", U32(buffer, 8220), "location", location, "predefined", predefined, "userOverride", location == 0 && !predefined);
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        string[] Apps(IntPtr profile, uint total)
        {
            if (total > 512) throw new InvalidOperationException("Perfil NVIDIA excessivamente amplo.");
            var apps = new List<string>();
            for (uint index = 0; index < total; index++)
            {
                IntPtr buffer = Buffer(AppSize, 1);
                try { uint count = 1; Check(Function<EnumItems>(0x7fa2173a)(session, profile, index, ref count, buffer), "DRS_EnumApplications"); if (count != 1) throw new InvalidOperationException("Inventário NVIDIA incompleto."); apps.Add(Marshal.PtrToStringUni(IntPtr.Add(buffer, 8), 2048).Split('\0')[0]); }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            return apps.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
        }
        public Dictionary<string, object> Read()
        {
            var branch = new StringBuilder(64); uint driver;
            Check(Function<Driver>(0x2926aaad)(out driver, branch), "GetDriverAndBranchVersion");
            IntPtr profile = Resolve(false);
            Dictionary<string, object> info;
            if (profile == IntPtr.Zero) info = Obj("exists", false, "name", "", "predefined", false, "applications", new string[0], "settingCount", 0);
            else
            {
                IntPtr buffer = Buffer(ProfileSize, 1);
                try
                {
                    Check(Function<Info>(0x61cd6fd6)(session, profile, buffer), "DRS_GetProfileInfo");
                    info = Obj("exists", true, "name", Marshal.PtrToStringUni(IntPtr.Add(buffer, 4), 2048).Split('\0')[0], "predefined", U32(buffer, 4104) != 0, "applications", Apps(profile, U32(buffer, 4108)), "settingCount", U32(buffer, 4112));
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            var recognized = RecognizedIds();
            return Obj("supported", true, "application", Application, "driverVersion", driver, "branch", branch.ToString(), "profile", info, "settings", Ids.Select(id => ReadSetting(profile, id, recognized.Contains(id))).ToArray());
        }
        public Dictionary<uint, uint> LocalSettings(IntPtr profile)
        {
            var result = new Dictionary<uint, uint>();
            for (uint index = 0; index < 512; index++)
            {
                IntPtr buffer = Buffer(SettingSize, 1);
                try
                {
                    uint count = 1; int status = Function<EnumItems>(0xae3039da)(session, profile, index, ref count, buffer);
                    if (status == -7 || (status == 0 && count == 0)) return result;
                    Check(status, "DRS_EnumSettings");
                    if (count != 1 || U32(buffer, 4104) != 0) throw new InvalidOperationException("Perfil CSBOOST recebeu um ajuste externo incompatível.");
                    result.Add(U32(buffer, 4100), U32(buffer, 8220));
                }
                finally { Marshal.FreeHGlobal(buffer); }
            }
            throw new InvalidOperationException("Perfil CSBOOST excede o limite de configurações.");
        }
        public void Set(IntPtr profile, uint id, uint value)
        {
            IntPtr buffer = Buffer(SettingSize, 1);
            try { W32(buffer, 4100, id); W32(buffer, 4104, 0); W32(buffer, 8220, value); Check(Function<Info>(0x577dd202)(session, profile, buffer), "DRS_SetSetting"); }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        public void DeleteSetting(IntPtr profile, uint id) { Check(Function<DeleteSettingCall>(0xe4a26362)(session, profile, id), "DRS_DeleteProfileSetting"); }
        public void Delete(IntPtr profile) { Check(Function<DeleteProfile>(0x17093206)(session, profile), "DRS_DeleteProfile"); }
        public void Save() { Check(Function<SessionCall>(0xfcbc7e14)(session), "DRS_SaveSettings"); }
        public Dictionary<string, object> ReloadRead() { Check(Function<SessionCall>(0x375dbd6b)(session), "DRS_LoadSettings"); return Read(); }
        public void Dispose()
        {
            if (session != IntPtr.Zero) { try { Function<SessionCall>(0xdad9cff8)(session); } catch { } session = IntPtr.Zero; }
            if (initialized) { try { Function<Simple>(0xd22bdd7e)(); } catch { } initialized = false; }
            if (library != IntPtr.Zero) { FreeLibrary(library); library = IntPtr.Zero; }
        }
    }
}

/* NVIDIA SDK interface declarations/constants are MIT licensed:
SPDX-FileCopyrightText: Copyright (c) 2019-2026 NVIDIA CORPORATION & AFFILIATES.
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to
do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
