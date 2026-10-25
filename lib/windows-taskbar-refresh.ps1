$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NodesTaskbarBrand {
 public static string Fingerprint(string path){using(var stream=System.IO.File.OpenRead(path))using(var sha=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
 [StructLayout(LayoutKind.Sequential, Pack=4)] public struct Key { public Guid format; public uint id; public Key(uint value){format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");id=value;} }
 [StructLayout(LayoutKind.Explicit, Size=24)] public struct Value { [FieldOffset(0)] public ushort type; [FieldOffset(8)] public IntPtr text; }
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface Store {
  [PreserveSig] int GetCount(out uint count);
  [PreserveSig] int GetAt(uint index,out Key key);
  [PreserveSig] int GetValue(ref Key key,out Value value);
  [PreserveSig] int SetValue(ref Key key,ref Value value);
  [PreserveSig] int Commit();
 }
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=false)] static extern void SHGetPropertyStoreFromParsingName(string path,IntPtr context,uint flags,ref Guid id,[MarshalAs(UnmanagedType.Interface)] out Store store);
 [DllImport("ole32.dll")] static extern int PropVariantClear(ref Value value);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern void SHChangeNotify(uint change,uint flags,string item,IntPtr unused);
 static string Read(Store store,uint id){var key=new Key(id);Value value;Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));try{return value.type==31?Marshal.PtrToStringUni(value.text):null;}finally{PropVariantClear(ref value);} }
 static bool Set(Store store,uint id,string text){if(Read(store,id)==text)return false;var key=new Key(id);var value=new Value{type=31,text=Marshal.StringToCoTaskMemUni(text)};try{Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value));return true;}finally{PropVariantClear(ref value);} }
 public static string[] Inspect(string path){var id=typeof(Store).GUID;Store store;SHGetPropertyStoreFromParsingName(path,IntPtr.Zero,0,ref id,out store);try{return new[]{Read(store,5),Read(store,2),Read(store,3),Read(store,4)};}finally{Marshal.ReleaseComObject(store);} }
 public static bool Update(string path,string appId,string command,string icon,string name){var id=typeof(Store).GUID;Store store;SHGetPropertyStoreFromParsingName(path,IntPtr.Zero,2,ref id,out store);try{if(Read(store,5)!=appId)throw new InvalidOperationException("Taskbar shortcut identity changed.");bool changed=Set(store,2,command);changed=Set(store,3,icon)||changed;changed=Set(store,4,name)||changed;if(changed)Marshal.ThrowExceptionForHR(store.Commit());return changed;}finally{Marshal.ReleaseComObject(store);} }
}
'@
$results=@()
foreach($record in (ConvertFrom-Json $env:NODES_TASKBAR_RECORDS)){
 try {
  if($env:NODES_TASKBAR_INSPECT -eq '1'){
   $value=[NodesTaskbarBrand]::Inspect($record.file)
   $results+=@{file=$record.file;appId=$value[0];relaunchCommand=$value[1];relaunchIcon=$value[2];displayName=$value[3]}
   continue
  }
  if([NodesTaskbarBrand]::Fingerprint($record.file) -ne $record.sha256){$results+=@{file=$record.file;status='concurrent-change'};continue}
  $changed=$false
  if($record.taskbar -and $record.displayName){$changed=[NodesTaskbarBrand]::Update($record.file,$record.appId,$record.command,($record.icon+',0'),$record.displayName)}
  [NodesTaskbarBrand]::SHChangeNotify(0x2000,0x2005,$record.file,[IntPtr]::Zero)
  $results+=@{file=$record.file;status='notified';brandingChanged=$changed}
 } catch {$results+=@{file=$record.file;status='failed';error=$_.Exception.Message}}
}
ConvertTo-Json -InputObject $results -Compress
