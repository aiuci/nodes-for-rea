// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
// Only Windows metadata is read. No candidate, shortcut, uninstall command or
// application is launched. The locator is data encoded separately from code.
export async function installedTargets(locator,files=[]){
  if(process.platform!=='win32')return {records:[],limitations:['Installed application lookup is available on Windows.']};
  const encoded=Buffer.from(locator,'utf8').toString('base64'),encodedFiles=Buffer.from(JSON.stringify(files),'utf8').toString('base64');
  const script=`$selected=[IO.Path]::GetFullPath([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')))
$name=Split-Path -Leaf $selected
$matchName=[regex]::Escape($name)
$records=@()
$locations=@()
$productNames=@($name)
$files=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedFiles}')))
foreach($file in $files){if(Test-Path -LiteralPath $file -PathType Leaf){$v=(Get-Item -LiteralPath $file).VersionInfo;$records+=@{path=$file;name=[string]$v.ProductName;description=[string]$v.FileDescription;source='Selected folder';reason='Found inside the selected folder. File metadata describes this component; it does not establish the main application.'}}}
$keys=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
foreach($r in (Get-ItemProperty $keys -ErrorAction SilentlyContinue)){
 $install=[Environment]::ExpandEnvironmentVariables([string]$r.InstallLocation).TrimEnd('\\','/')
 $sameLocation=$install -and ($install -eq $selected.TrimEnd('\\','/'))
 if($r.DisplayName -and (($r.DisplayName -match ('^'+$matchName+'(?:\\s|$)')) -or $sameLocation)){
  if($install){$locations+=$install}
  $icon=[Environment]::ExpandEnvironmentVariables([string]$r.DisplayIcon)
  if($icon -match '^"([^"\r\n]+\\.exe)"'){ $file=$Matches[1] } elseif($icon -match '^(.+?\\.exe)(?:,[-0-9]+)?$'){ $file=$Matches[1] } else { $file='' }
  if($file -and (Test-Path -LiteralPath $file -PathType Leaf)){$v=(Get-Item -LiteralPath $file).VersionInfo;if($v.ProductName){$productNames+=$v.ProductName};$records+=@{path=$file;name=[string]$v.ProductName;description=[string]$v.FileDescription;displayName=[string]$r.DisplayName;installLocation=$install;source='Windows installation record';reason='Windows registers this file as the installed application icon.'}}
  elseif($sameLocation){
   foreach($entry in @(Get-ChildItem -LiteralPath $install -Filter *.exe -File -ErrorAction SilentlyContinue | Select-Object -First 32)){
    $v=$entry.VersionInfo
    if($v.ProductName -and ($r.DisplayName -match ('^'+[regex]::Escape($v.ProductName)+'(?:\\s|$)'))){$productNames+=$v.ProductName;$records+=@{path=$entry.FullName;name=[string]$v.ProductName;description=[string]$v.FileDescription;displayName=[string]$r.DisplayName;installLocation=$install;source='Windows installation record';reason='The registered installation folder and product name match the executable metadata.'}}
   }
  }
 }
}
$menus=@([Environment]::GetFolderPath('CommonStartMenu'),[Environment]::GetFolderPath('StartMenu'))
$links=@($menus | Where-Object {$_} | ForEach-Object {Get-ChildItem -LiteralPath $_ -Filter *.lnk -Recurse -ErrorAction SilentlyContinue} | Select-Object -First 500)
$shell=New-Object -ComObject WScript.Shell
foreach($link in $links){$matchesName=@($productNames | Where-Object {$link.BaseName -match ('^'+[regex]::Escape($_)+'(?:\\s|$)')}).Count -gt 0;if($matchesName){try{$file=$shell.CreateShortcut($link.FullName).TargetPath;$inLocation=(!$locations.Count) -or @($locations | Where-Object {$file.StartsWith($_+'\\',[StringComparison]::OrdinalIgnoreCase)}).Count -gt 0;if($inLocation -and $file -match '\\.exe$' -and (Test-Path -LiteralPath $file -PathType Leaf)){$v=(Get-Item -LiteralPath $file).VersionInfo;$records+=@{path=$file;name=[string]$v.ProductName;description=[string]$v.FileDescription;displayName=$link.BaseName;source='Start menu shortcut';reason='The application shortcut points to this file.'}}}catch{}}}
ConvertTo-Json -InputObject @($records | Sort-Object @{Expression={if($_.source -eq 'Selected folder'){1}else{0}}}) -Compress -Depth 4`;
  try{const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:12000,maxBuffer:2*1024*1024,encoding:'utf8'});return {records:JSON.parse(stdout.replace(/^\uFEFF/,'').trim()||'[]'),limitations:[]};}
  catch{return {records:[],limitations:['Windows application metadata could not be read. Choose the application file instead.']};}
}
