import { Vector3 } from "three";
import { BuildPlateOrigin } from "../../contexts/ViewOptionsContext";

// Match the existing printable grid; decorative plate tabs may extend outside it.
export const BUILD_PLATE_SIZE = 250;
export function buildPlateOffset(origin: BuildPlateOrigin): Vector3 {
  const offset =
    origin === BuildPlateOrigin.LowerLeft ? BUILD_PLATE_SIZE / 2 : 0;
  return new Vector3(offset, offset, 0);
}
