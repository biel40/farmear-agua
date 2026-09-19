import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  get<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is best-effort when storage is unavailable or full.
    }
  }
}