import { API_URL, TEST_API_URL } from "./config.js";

// ?test i adressen kör sidan mot testmiljön
export const IS_TEST = new URLSearchParams(location.search).has("test");
export const BASE = IS_TEST ? TEST_API_URL : API_URL;

async function parse(res) {
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

export async function fetchBookings() {
  return parse(await fetch(`${BASE}?action=bookings&t=${Date.now()}`));
}

export async function post(body) {
  // text/plain undviker CORS-preflight mot Apps Script
  return parse(await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  }));
}
