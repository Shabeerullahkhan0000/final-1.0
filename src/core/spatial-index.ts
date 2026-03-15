/**
 * Spatial Index — Flatbush R-tree wrapper for fast viewport culling & snap queries
 */
import Flatbush from 'flatbush';
import type { AnyCADEntity, BBox } from './types';

export class SpatialIndex {
  private tree: Flatbush | null = null;
  private entities: AnyCADEntity[] = [];
  private idMap: Map<string, number> = new Map();

  build(entities: AnyCADEntity[]): void {
    this.entities = entities;
    this.idMap.clear();
    if (entities.length === 0) { this.tree = null; return; }

    this.tree = new Flatbush(entities.length);
    for (let i = 0; i < entities.length; i++) {
      const { minX, minY, maxX, maxY } = entities[i].bounds;
      this.tree.add(minX, minY, maxX, maxY);
      this.idMap.set(entities[i].id, i);
    }
    this.tree.finish();
  }

  search(bbox: BBox): AnyCADEntity[] {
    if (!this.tree || this.entities.length === 0) return [];
    const ids = this.tree.search(bbox.minX, bbox.minY, bbox.maxX, bbox.maxY);
    return ids.map(i => this.entities[i]);
  }

  searchPoint(x: number, y: number, radius: number): AnyCADEntity[] {
    return this.search({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius });
  }

  get size(): number { return this.entities.length; }
  getAll(): AnyCADEntity[] { return this.entities; }
}
