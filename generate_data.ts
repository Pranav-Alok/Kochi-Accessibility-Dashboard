import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

async function generateWards() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: "Generate a GeoJSON FeatureCollection for Kochi (Cochin) Corporation wards. Include at least 20 major wards with their names and approximate polygon coordinates. Also include mobility indicators (bus_access, walkability, last_mile) as properties with values between 0.4 and 1.0. Return ONLY the JSON.",
  });

  const text = response.text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    fs.writeFileSync('./src/data/kochi-wards.ts', `export const KOCHI_WARDS_GEOJSON = ${jsonMatch[0]};`);
    console.log("Generated kochi-wards.ts");
  } else {
    console.error("Failed to parse JSON from Gemini response");
  }
}

generateWards();
