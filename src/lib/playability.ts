import type { Condition, Location } from "./types";

// The live verdict on each card: can I play right now, and what to adjust for.
// Derived on the page from the stored reading, never stored, so the worker only
// writes when the weather itself changes.

export type Level = "go" | "caution" | "no";
export type Verdict = { level: Level; headline: string; tips: string[] };

const thunder = (code: number) => code >= 95;
const snow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86;
const wet = (c: Pick<Condition, "weather_code" | "precip_in">) =>
  c.precip_in >= 0.01 || (c.weather_code >= 51 && c.weather_code <= 67) || (c.weather_code >= 80 && c.weather_code <= 82);

export function verdict(c: Condition, kind: Location["kind"], now: number): Verdict {
  const tips: string[] = [];
  const feels = Math.round(c.feels_like_f);
  const gust = Math.round(c.gust_mph);
  const wind = Math.round(c.wind_mph);

  // Stop-play conditions, most serious first.
  if (thunder(c.weather_code)) return { level: "no", headline: "Lightning risk: stay off", tips: ["Thunderstorms at this location. Wait 30 minutes after the last thunder."] };
  if (snow(c.weather_code)) return { level: "no", headline: "Snowing", tips: ["Snow on the ground closes the course. Head to a simulator."] };
  const dark = !c.is_day || now >= Date.parse(c.sunset);
  if (dark && kind === "course") return { level: "no", headline: "After sunset", tips: ["Too dark to play. Check tomorrow's first tee times."] };
  if (feels <= 32) return { level: "no", headline: "Frost risk", tips: [`Feels like ${feels}°F. Courses hold tee times for frost; call ahead.`] };

  let level: Level = "go";
  const caution = (tip: string) => {
    level = "caution";
    tips.push(tip);
  };

  if (dark) caution("After dark: check the range's hours before you go.");
  if (wet(c)) caution("Rain right now: dry grips and a towel. Greens roll slower.");
  if (gust >= 30 || wind >= 20) caution(`Blustery, ${wind} mph gusting ${gust}: take two extra clubs into it and keep the ball low.`);
  else if (gust >= 20 || wind >= 12) caution(`Breezy, ${wind} mph gusting ${gust}: about one club either way into or with it.`);
  if (feels < 45) caution(`Feels like ${feels}°F: layers, and expect less carry on full shots.`);
  else if (feels >= 90) caution(`Feels like ${feels}°F: water every few holes.`);

  if (!dark && kind === "course") {
    const left = Date.parse(c.sunset) - now;
    if (left < 2.5 * 3600_000) caution(`${Math.max(0, Math.floor(left / 60_000))} min of daylight left: 9 holes at most.`);
  }

  const headline = level === "go" ? "Great golf weather" : tips.length === 1 ? "Playable, with one thing to know" : "Playable, with a few things to know";
  return { level, headline, tips: tips.length ? tips : ["Nothing to adjust for. Go play."] };
}
