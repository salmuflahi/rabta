//! Explicit local utilities. Arguments never become shell or script source.
use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Default)]
pub struct UtilityState(Mutex<AwakeSession>);
#[derive(Default)]
struct AwakeSession { child: Option<Child>, until: Option<u64>, display: bool }
impl AwakeSession {
    fn stop(&mut self) { if let Some(mut child)=self.child.take(){let _=child.kill();let _=child.wait();} self.until=None; }
}
impl Drop for AwakeSession { fn drop(&mut self){self.stop();} }
impl UtilityState { pub fn stop(&self){if let Ok(mut s)=self.0.lock(){s.stop();}} }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct UtilityStatus { platform:&'static str, awake_until:Option<u64>, keep_display:bool }
fn mac_only()->Result<(),String>{if cfg!(target_os="macos"){Ok(())}else{Err("This control requires the Rabta macOS app.".into())}}
fn now()->u64{SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}
#[tauri::command]
pub fn utility_status(state:State<'_,UtilityState>)->Result<UtilityStatus,String>{
    let mut s=state.0.lock().map_err(|_|"Utility state is unavailable.")?;
    if let Some(child)=s.child.as_mut(){if child.try_wait().map_err(|e|e.to_string())?.is_some(){s.child=None;s.until=None;}}
    Ok(UtilityStatus{platform:std::env::consts::OS,awake_until:s.until,keep_display:s.display})
}
#[tauri::command]
pub fn utility_keep_awake(state:State<'_,UtilityState>,minutes:u32,keep_display:bool)->Result<(),String>{
    mac_only()?;if !(1..=720).contains(&minutes){return Err("Choose 1–720 minutes.".into());}
    let mut s=state.0.lock().map_err(|_|"Utility state is unavailable.")?;
    let mut command=Command::new("/usr/bin/caffeinate");command.args(["-i","-t",&(minutes*60).to_string()]);if keep_display{command.arg("-d");}
    let child=command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e|format!("Could not keep this Mac awake: {e}"))?;
    s.stop();s.child=Some(child);s.until=Some(now()+u64::from(minutes)*60);s.display=keep_display;Ok(())
}
#[tauri::command]
pub fn utility_stop_awake(state:State<'_,UtilityState>)->Result<(),String>{state.0.lock().map_err(|_|"Utility state is unavailable.")?.stop();Ok(())}

async fn output(program:&str,args:&[&str],seconds:u64)->Result<String,String>{
    mac_only()?;
    let mut command=tokio::process::Command::new(program);command.args(args).stdin(Stdio::null()).kill_on_drop(true);
    let result=tokio::time::timeout(Duration::from_secs(seconds),command.output()).await.map_err(|_|"The Mac did not respond in time. Try again.")?.map_err(|e|e.to_string())?;
    if !result.status.success(){let error=String::from_utf8_lossy(&result.stderr);return Err(format!("macOS could not complete this action. {}",error.chars().take(600).collect::<String>()));}
    if result.stdout.len()>1_000_000{return Err("The system response was too large.".into());}
    Ok(String::from_utf8_lossy(&result.stdout).trim().to_string())
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct SoundStatus{volume:u8,input_volume:u8,muted:bool}
#[tauri::command]
pub async fn utility_sound_status()->Result<SoundStatus,String>{
    let result=output("/usr/bin/osascript",&["-e","set v to get volume settings\nreturn (output volume of v as string) & \"|\" & (input volume of v as string) & \"|\" & (output muted of v as string)"],15).await?;
    let parts:Vec<_>=result.split('|').collect();if parts.len()!=3{return Err("This audio device does not expose software volume controls.".into());}
    Ok(SoundStatus{volume:parts[0].parse().map_err(|_|"Output volume is unavailable.")?,input_volume:parts[1].parse().map_err(|_|"Input volume is unavailable.")?,muted:parts[2]=="true"})
}
#[tauri::command]
pub async fn utility_set_sound(kind:String,value:u8)->Result<SoundStatus,String>{
    if kind=="mute"&&value>1{return Err("Mute must be 0 or 1.".into());}
    if value>100{return Err("Volume must be between 0 and 100.".into());}
    let script=match kind.as_str(){
      "output"=>"on run argv\nset volume output volume (item 1 of argv as integer)\nend run",
      "input"=>"on run argv\nset volume input volume (item 1 of argv as integer)\nend run",
      "mute"=>"on run argv\nset volume output muted ((item 1 of argv as integer) is 1)\nend run",
      _=>return Err("Unknown audio control.".into())
    };
    output("/usr/bin/osascript",&["-e",script,&value.to_string()],15).await?;utility_sound_status().await
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct SystemInfo{macos:String,memory_bytes:u64,processor:String,battery:String,storage:String}
#[tauri::command]
pub async fn utility_system_info()->Result<SystemInfo,String>{
    let (macos,memory,processor,battery,storage)=tokio::join!(
      output("/usr/bin/sw_vers",&["-productVersion"],10),output("/usr/sbin/sysctl",&["-n","hw.memsize"],10),
      output("/usr/sbin/sysctl",&["-n","machdep.cpu.brand_string"],10),output("/usr/bin/pmset",&["-g","batt"],10),output("/bin/df",&["-h","/"],10));
    Ok(SystemInfo{macos:macos?,memory_bytes:memory?.parse().map_err(|_|"Could not read memory capacity.")?,processor:processor.unwrap_or_else(|_|"Unavailable".into()),battery:battery.unwrap_or_else(|_|"Battery information unavailable.".into()),storage:storage.unwrap_or_else(|_|"Storage information unavailable.".into())})
}
#[tauri::command]
pub async fn utility_capture()->Result<Option<String>,String>{
    mac_only()?;
    let home=std::env::var_os("HOME").ok_or("Home folder is unavailable.")?;
    let directory=std::path::PathBuf::from(home).join("Pictures").join("Rabta");
    std::fs::create_dir_all(&directory).map_err(|e|format!("Could not create Pictures/Rabta: {e}"))?;
    let path=directory.join(format!("Rabta-{}.png",uuid::Uuid::new_v4()));
    let path_string=path.to_str().ok_or("Screenshot path is not valid UTF-8.")?;
    let result=output("/usr/sbin/screencapture",&["-i","-x","-t","png",path_string],180).await;
    if !path.exists(){return match result{Ok(_)=>Ok(None),Err(e) if e.contains("User cancelled")=>Ok(None),Err(e)=>Err(e)};}
    result?;
    if std::fs::metadata(&path).map_err(|e|e.to_string())?.len()==0{return Err("No screenshot was captured. Try again.".into());}
    Ok(Some(path_string.to_string()))
}
#[tauri::command]
pub async fn utility_window_apps()->Result<Vec<String>,String>{
    let json=output("/usr/bin/osascript",&["-l","JavaScript","-e","JSON.stringify(Application('System Events').processes.whose({backgroundOnly:false}).name())"],15).await?;
    let mut names:Vec<String>=serde_json::from_str(&json).map_err(|_|"Could not read open applications.")?;names.retain(|n|!n.is_empty()&&n.len()<300);names.sort();names.dedup();Ok(names)
}
#[derive(Serialize,Deserialize)]
pub struct WindowPlacement{pub app:String,pub title:String,pub x:f64,pub y:f64,pub width:f64,pub height:f64}
const WINDOW_SCRIPT:&str=include_str!("utility-window.js");
#[tauri::command]
pub async fn utility_arrange_window(app:String,layout:String,gap:u32,restore:Option<WindowPlacement>)->Result<WindowPlacement,String>{
    if app.is_empty()||app.len()>300||gap>64{return Err("Choose an app and a gap between 0 and 64 pixels.".into());}
    if !["left","right","top-left","top-right","bottom-left","bottom-right","center","maximize"].contains(&layout.as_str()){return Err("Choose a supported window layout.".into());}
    if let Some(r)=&restore{if r.app!=app||![r.x,r.y,r.width,r.height].iter().all(|n|n.is_finite())||r.width<100.0||r.height<100.0||r.width>20000.0||r.height>20000.0||r.x.abs()>50000.0||r.y.abs()>50000.0{return Err("The saved window placement is invalid.".into());}}
    let request=serde_json::json!({"app":app,"layout":layout,"gap":gap,"restore":restore}).to_string();
    let value=output("/usr/bin/osascript",&["-l","JavaScript","-e",WINDOW_SCRIPT,&request],20).await?;
    serde_json::from_str(&value).map_err(|_|"macOS did not return a window placement.".into())
}
