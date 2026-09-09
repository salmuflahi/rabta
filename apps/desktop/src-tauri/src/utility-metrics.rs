use serde_json::{json, Value};
use std::collections::HashMap;

#[derive(Default)]
pub(super) struct Sampler { previous: Option<Previous> }
struct Previous { time: f64, ticks: Vec<u64>, interfaces: HashMap<String, (u64, u64)> }
impl Sampler {
    pub(super) fn sample(&mut self, mut value: Value) -> Value {
        let time = value["uptimeSeconds"].as_f64().unwrap_or(0.0);
        let ticks: Vec<_> = value["cpuTicks"].as_array().map(|items| items.iter().filter_map(Value::as_u64).collect()).unwrap_or_default();
        let interfaces: HashMap<_, _> = value["interfaces"].as_array().map(|items| items.iter().filter_map(|item| Some((item["name"].as_str()?.to_string(), (item["received"].as_u64()?, item["sent"].as_u64()?)))).collect()).unwrap_or_default();
        let elapsed = self.previous.as_ref().map(|previous| time - previous.time).unwrap_or(0.0);
        value["cpuPercent"] = Value::Null;
        value["sampleSeconds"] = if elapsed > 0.0 { json!(elapsed) } else { Value::Null };
        if let Some(previous) = &self.previous {
            if elapsed > 0.0 && elapsed <= 30.0 && ticks.len() == 4 && previous.ticks.len() == 4 {
                let delta: Vec<_> = ticks.iter().zip(&previous.ticks).map(|(now, before)| (*now as u32).wrapping_sub(*before as u32) as u64).collect();
                let total: u64 = delta.iter().sum();
                if total > 0 { value["cpuPercent"] = json!((total - delta[2]) as f64 * 100.0 / total as f64); }
            }
        }
        if let Some(items) = value["interfaces"].as_array_mut() {
            for item in items {
                let previous = item["name"].as_str().and_then(|name| self.previous.as_ref()?.interfaces.get(name));
                for (key, total_key, before) in [("receivePerSecond", "received", previous.map(|v| v.0)), ("sendPerSecond", "sent", previous.map(|v| v.1))] {
                    item[key] = match (item[total_key].as_u64(), before) {
                        (Some(total), Some(before)) if elapsed > 0.0 && elapsed <= 30.0 && total >= before => json!((total - before) as f64 / elapsed),
                        _ => Value::Null,
                    };
                }
            }
        }
        if self.previous.as_ref().map_or(true, |previous| time > previous.time) { self.previous = Some(Previous { time, ticks, interfaces }); }
        if let Some(object) = value.as_object_mut() { object.remove("cpuTicks"); }
        value
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn reading(time:f64, ticks:Vec<u64>, bytes:u64) -> Value { json!({"uptimeSeconds":time, "cpuTicks":ticks, "interfaces":[{"name":"en0","received":bytes,"sent":bytes}]}) }
    #[test] fn first_sample_is_unknown_and_rates_use_elapsed_time() {
        let mut sampler = Sampler::default();
        assert!(sampler.sample(reading(1.0, vec![10,10,80,0],100))["cpuPercent"].is_null());
        let next = sampler.sample(reading(3.0, vec![20,20,160,0],500));
        assert_eq!(next["cpuPercent"],20.0);
        assert_eq!(next["interfaces"][0]["receivePerSecond"],200.0);
    }
    #[test] fn network_reset_and_resume_do_not_invent_negative_or_spiky_rates() {
        let mut sampler = Sampler::default(); sampler.sample(reading(1.0,vec![1,1,8,0],1000));
        assert!(sampler.sample(reading(3.0,vec![2,2,16,0],10))["interfaces"][0]["receivePerSecond"].is_null());
        assert!(sampler.sample(reading(90.0,vec![3,3,24,0],10000))["interfaces"][0]["receivePerSecond"].is_null());
    }
}
