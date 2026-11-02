// Words for Open-Meteo's numbers (carried over from Assignment 4).

export function describeWeather(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Mixed";
}

const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const words = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const point = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;
// Where the wind comes from.
export const compass = (deg: number) => points[point(deg)];
export const compassWords = (deg: number) => words[point(deg)];
