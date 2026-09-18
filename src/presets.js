// Creative defaults, not claims about a painting's measured material.
export const surfaces = {
  'Flat print': [0, 0, 0, 0],
  'Canvas': [0.65, 0.35, 0.05, 5],
  'Heavy brushwork': [0.8, 1.1, 0.25, 12],
  'Impasto': [0.9, 1.5, 0.4, 17],
  'Plaster / fresco': [0.55, 1.1, 0.55, 11],
  'Cement': [1, 1.2, 0.65, 14],
};
export const materials = {
  'Matte acrylic': [0.8, 0.35, 0],
  'Oil paint': [0.55, 0.9, 0],
  'Gloss varnish': [0.24, 1.1, 0],
  'Canvas': [0.88, 0.25, 0],
  'Plaster / fresco': [0.92, 0.18, 0],
  'Cement': [0.85, 0.3, 0],
  'Metallic leaf': [0.32, 1, 0.85],
  'Resin': [0.13, 1, 0],
};
// x, y, z, power, Kelvin, cone, softness; all lights aim toward the artwork center.
export const lighting = {
  'Gallery track': [[0.3, 1.05, 0.8, 4.5, 4000, 0.3, 0.55]],
  'Soft window': [[-0.15, 0.7, 0.9, 5.5, 6500, 0, 0.95]],
  'Raking light': [[-0.12, 0.6, 0.18, 2.7, 5000, 0, 0.12]],
  'Warm spotlight': [[0.3, 0.85, 0.65, 3.2, 3000, 0.7, 0.55]],
  'Cool museum': [[0.2, 0.95, 1, 4, 6000, 0.3, 0.7], [0.85, 0.9, 1, 2, 6000, 0.25, 0.7]],
  'Two-light studio': [[-0.1, 0.75, 0.8, 4, 5500, 0, 0.85], [1.1, 0.7, 0.8, 3, 5500, 0, 0.85]],
  'Overhead wash': [[0.5, 1.2, 0.85, 6, 4500, 0, 0.8]],
  'Sunset side': [[-0.2, 0.55, 0.25, 3, 2400, 0, 0.25]],
};

export class History {
  constructor(limit = 40) { this.limit = limit; this.entries = []; this.index = -1; }
  reset(value) { this.entries = [JSON.stringify(value)]; this.index = 0; }
  push(value) {
    const json = JSON.stringify(value);
    if (json === this.entries[this.index]) return;
    this.entries.splice(this.index + 1);
    this.entries.push(json);
    if (this.entries.length > this.limit) this.entries.shift();
    this.index = this.entries.length - 1;
  }
  undo() { if (this.index > 0) return JSON.parse(this.entries[--this.index]); }
  redo() { if (this.index + 1 < this.entries.length) return JSON.parse(this.entries[++this.index]); }
}
