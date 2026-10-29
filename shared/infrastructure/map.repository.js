import { DuplicateError } from "../domain/errors.js";

export class MapRepository {
  #data = new Map();
  data2object(data) { return data; }
  add(bean) {
    if (this.getById(bean.id)) throw new DuplicateError('id');
    this.#data.set(bean.id, bean); 
  }
  list() { return [...this.#data.values()].map(this.data2object); }
  update(bean) { this.#data.set(bean.id, bean); }
  delete(id) { this.#data.delete(id); }
  getById(id) {
    const d = this.#data.get(id);
    return d && this.data2object(d);
  }
}
