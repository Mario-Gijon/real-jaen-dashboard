import type { DataSource } from "../data-source";

/**
 * Invented season used for development (files under `data/synthetic`, added in
 * the next step). Only this adapter reads those files.
 */
export const syntheticSource: DataSource = {
  info: () => ({ synthetic: true, label: "Datos sintéticos" }),
};
