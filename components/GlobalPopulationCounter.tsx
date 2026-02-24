"use client";

import { useState, useEffect } from "react";

const BASE_POPULATION = 8_298_978_817;
const BASE_DATE = new Date("2026-02-24T00:00:00Z");
const BIRTHS_PER_DAY = 15_000;
const BIRTHS_PER_SECOND = BIRTHS_PER_DAY / (24 * 60 * 60);
const TICK_MS = 100;

function getInitialPopulation(): number {
  const now = new Date();
  const diffMs = now.getTime() - BASE_DATE.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const birthsSinceBase = diffDays * BIRTHS_PER_DAY;
  return BASE_POPULATION + birthsSinceBase;
}

export function GlobalPopulationCounter() {
  const [population, setPopulation] = useState<number | null>(null);

  useEffect(() => {
    const initial = getInitialPopulation();
    setPopulation(initial);

    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const current = initial + elapsedSeconds * BIRTHS_PER_SECOND;
      setPopulation(Math.floor(current));
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  if (population === null) {
    return (
      <div className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-mono font-bold tabular-nums text-zinc-500">
        {BASE_POPULATION.toLocaleString()}
      </div>
    );
  }

  return (
    <div className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-mono font-bold tabular-nums text-zinc-100">
      {population.toLocaleString()}
    </div>
  );
}
