// Independent, read-only Win32 display inventory for CSBOOST.
// ABI: Microsoft Learn DEVMODEW / DISPLAY_DEVICEW, checked 2026-10-14.
// No display, registry, gamma, driver, or monitor write API is imported.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

internal static class DisplayWorker
{
    const uint Attached = 0x00000001, Primary = 0x00000004, Mirroring = 0x00000008;
    const uint DM_BITSPERPEL = 0x00040000, DM_PELSWIDTH = 0x00080000, DM_PELSHEIGHT = 0x00100000;
    const uint DM_DISPLAYFLAGS = 0x00200000, DM_DISPLAYFREQUENCY = 0x00400000, DM_DISPLAYORIENTATION = 0x00000080;
    const uint DM_INTERLACED = 0x00000002, CurrentSettings = 0xffffffff;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024, RecursionLimit = 16 };

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct DISPLAY_DEVICEW
    {
        public uint cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public uint StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct DEVMODEW
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
        public uint dmFields;
        // Display branch of the 16-byte union (POINTL + two DWORDs).
        public int dmPositionX, dmPositionY;
        public uint dmDisplayOrientation, dmDisplayFixedOutput;
        public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public ushort dmLogPixels;
        public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
        public uint dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool EnumDisplayDevicesW(string device, uint index, ref DISPLAY_DEVICEW display, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool EnumDisplaySettingsExW(string device, uint modeIndex, ref DEVMODEW mode, uint flags);

    static Dictionary<string, object> Obj(params object[] pairs)
    {
        var value = new Dictionary<string, object>();
        for (int i = 0; i < pairs.Length; i += 2) value.Add((string)pairs[i], pairs[i + 1]);
        return value;
    }
    static DISPLAY_DEVICEW Device() { return new DISPLAY_DEVICEW { cb = (uint)Marshal.SizeOf(typeof(DISPLAY_DEVICEW)) }; }
    static DEVMODEW Mode() { return new DEVMODEW { dmSize = (ushort)Marshal.SizeOf(typeof(DEVMODEW)), dmDriverExtra = 0 }; }
    static void CheckAbi()
    {
        if (Marshal.SizeOf(typeof(DEVMODEW)) != 220 || Marshal.SizeOf(typeof(DISPLAY_DEVICEW)) != 840)
            throw new InvalidOperationException("ABI de inventário de monitores incompatível.");
    }
    static Dictionary<string, object> DescribeMode(DEVMODEW value)
    {
        uint required = DM_BITSPERPEL | DM_PELSWIDTH | DM_PELSHEIGHT;
        if ((value.dmFields & required) != required || value.dmPelsWidth < 320 || value.dmPelsWidth > 32768 || value.dmPelsHeight < 200 || value.dmPelsHeight > 32768 || value.dmBitsPerPel < 8 || value.dmBitsPerPel > 64)
            return null;
        bool frequencyKnown = (value.dmFields & DM_DISPLAYFREQUENCY) != 0 && value.dmDisplayFrequency > 1 && value.dmDisplayFrequency <= 2000;
        uint orientation = (value.dmFields & DM_DISPLAYORIENTATION) != 0 ? value.dmDisplayOrientation : 0;
        if (orientation > 3) return null;
        return Obj("width", value.dmPelsWidth, "height", value.dmPelsHeight,
            "refreshHz", frequencyKnown ? (object)value.dmDisplayFrequency : null,
            "bitsPerPixel", value.dmBitsPerPel, "interlaced", (value.dmFields & DM_DISPLAYFLAGS) != 0 && (value.dmDisplayFlags & DM_INTERLACED) != 0,
            "orientation", orientation);
    }
    static string ModeKey(Dictionary<string, object> mode)
    {
        return mode["width"] + ":" + mode["height"] + ":" + mode["refreshHz"] + ":" + mode["bitsPerPixel"] + ":" + mode["interlaced"] + ":" + mode["orientation"];
    }
    static object Read()
    {
        var displays = new List<object>();
        for (uint adapterIndex = 0; adapterIndex < 256; adapterIndex++)
        {
            var adapter = Device();
            if (!EnumDisplayDevicesW(null, adapterIndex, ref adapter, 0)) break;
            if ((adapter.StateFlags & Attached) == 0 || (adapter.StateFlags & Mirroring) != 0) continue;
            if (displays.Count >= 32) throw new InvalidOperationException("Quantidade de monitores excede o limite do inventário.");
            var currentMode = Mode();
            if (!EnumDisplaySettingsExW(adapter.DeviceName, CurrentSettings, ref currentMode, 0))
                throw new InvalidOperationException("O Windows não informou o modo atual de " + adapter.DeviceName + ".");
            var current = DescribeMode(currentMode);
            if (current == null) throw new InvalidOperationException("O Windows retornou um modo de monitor inválido.");
            var modes = new List<Dictionary<string, object>>();
            var seen = new HashSet<string>();
            for (uint index = 0; index <= 4096; index++)
            {
                var raw = Mode();
                // flags=0: monitor-compatible modes in the current orientation;
                // deliberately no EDS_RAWMODE or EDS_ROTATEDMODE.
                if (!EnumDisplaySettingsExW(adapter.DeviceName, index, ref raw, 0)) break;
                if (index == 4096) throw new InvalidOperationException("Quantidade de modos excede o limite do inventário.");
                var mode = DescribeMode(raw);
                if (mode != null && seen.Add(ModeKey(mode))) modes.Add(mode);
            }
            var monitorNames = new List<string>();
            for (uint index = 0; index < 64; index++)
            {
                var monitor = Device();
                if (!EnumDisplayDevicesW(adapter.DeviceName, index, ref monitor, 0)) break;
                if ((monitor.StateFlags & Attached) != 0 && !String.IsNullOrWhiteSpace(monitor.DeviceString) && !monitorNames.Contains(monitor.DeviceString)) monitorNames.Add(monitor.DeviceString);
            }
            displays.Add(Obj("id", adapter.DeviceName, "adapterName", adapter.DeviceString ?? "",
                "monitorNames", monitorNames.ToArray(), "monitorName", monitorNames.Count == 0 ? "Monitor não identificado" : String.Join(" / ", monitorNames.ToArray()),
                "primary", (adapter.StateFlags & Primary) != 0, "current", current,
                "modes", modes.OrderBy(x => Convert.ToUInt32(x["width"])).ThenBy(x => Convert.ToUInt32(x["height"])).ThenBy(x => x["refreshHz"] == null ? 0 : Convert.ToUInt32(x["refreshHz"])).ThenBy(x => Convert.ToUInt32(x["bitsPerPixel"])).ToArray()));
        }
        if (displays.Count == 0) throw new InvalidOperationException("Nenhum monitor ativo foi informado nesta sessão do Windows.");
        return Obj("source", "EnumDisplaySettingsExW", "enumeratedAt", DateTime.UtcNow.ToString("o"), "displays", displays.ToArray());
    }
    static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            CheckAbi();
            if (args.Length == 1 && args[0] == "--self-test")
            {
                Console.WriteLine(Json.Serialize(Obj("ok", true, "value", Obj("devmodeSize", 220, "displayDeviceSize", 840, "readOnly", true))));
                return 0;
            }
            if (args.Length != 2 || args[0] != "--request" || args[1].Length > 4096) throw new InvalidOperationException("Solicitação de monitor inválida.");
            var request = Json.Deserialize<Dictionary<string, object>>(Encoding.UTF8.GetString(Convert.FromBase64String(args[1])));
            if (request == null || request.Count != 1 || !request.ContainsKey("operation") || !(request["operation"] is string) || (string)request["operation"] != "read")
                throw new InvalidOperationException("O worker de monitores permite apenas leitura.");
            Console.WriteLine(Json.Serialize(Obj("ok", true, "value", Read())));
            return 0;
        }
        catch (Exception error)
        {
            Console.WriteLine(Json.Serialize(Obj("ok", false, "error", error.Message)));
            return 1;
        }
    }
}
