import { describe, it, expect } from 'vitest'
import {
  getUnitInfo,
  getUnitSystem,
  areSameSystem,
  areSameType,
  convertUnit,
  normalizeUnit,
  normalizeAmount,
  convertWeightToVolume,
  formatAmount,
  type UnitSystem,
} from './unitConversion'

describe('unitConversion', () => {
  describe('getUnitInfo', () => {
    it('should return unit info for valid units', () => {
      const info = getUnitInfo('g')
      expect(info).toBeDefined()
      expect(info?.name).toBe('g')
      expect(info?.system).toBe('metric')
      expect(info?.type).toBe('weight')
    })
    
    it('should return null for unknown units', () => {
      expect(getUnitInfo('unknown')).toBeNull()
    })
    
    it('should handle case-insensitive units', () => {
      expect(getUnitInfo('G')).toBeDefined()
      expect(getUnitInfo('CUP')).toBeDefined()
    })
    
    it('should handle units with spaces', () => {
      expect(getUnitInfo('fl oz')).toBeDefined()
    })
  })
  
  describe('getUnitSystem', () => {
    it('should return metric for metric units', () => {
      expect(getUnitSystem('g')).toBe('metric')
      expect(getUnitSystem('kg')).toBe('metric')
      expect(getUnitSystem('ml')).toBe('metric')
      expect(getUnitSystem('l')).toBe('metric')
    })
    
    it('should return imperial for imperial units', () => {
      expect(getUnitSystem('oz')).toBe('imperial')
      expect(getUnitSystem('lb')).toBe('imperial')
      expect(getUnitSystem('cup')).toBe('imperial')
      expect(getUnitSystem('tbsp')).toBe('imperial')
    })
    
    it('should return none for count units', () => {
      expect(getUnitSystem('pinch')).toBe('none')
      expect(getUnitSystem('clove')).toBe('none')
    })
    
    it('should return none for unknown units', () => {
      expect(getUnitSystem('unknown')).toBe('none')
      expect(getUnitSystem(undefined)).toBe('none')
    })
  })
  
  describe('areSameSystem', () => {
    it('should return true for same metric units', () => {
      expect(areSameSystem('g', 'kg')).toBe(true)
      expect(areSameSystem('ml', 'l')).toBe(true)
    })
    
    it('should return true for same imperial units', () => {
      expect(areSameSystem('oz', 'lb')).toBe(true)
      expect(areSameSystem('cup', 'tbsp')).toBe(true)
    })
    
    it('should return false for different systems', () => {
      expect(areSameSystem('g', 'oz')).toBe(false)
      expect(areSameSystem('ml', 'cup')).toBe(false)
    })
    
    it('should return false for count units', () => {
      expect(areSameSystem('pinch', 'clove')).toBe(false)
      expect(areSameSystem('g', 'pinch')).toBe(false)
    })
    
    it('should return false for undefined units', () => {
      expect(areSameSystem(undefined, 'g')).toBe(false)
      expect(areSameSystem('g', undefined)).toBe(false)
    })
  })
  
  describe('areSameType', () => {
    it('should return true for same weight units', () => {
      expect(areSameType('g', 'kg')).toBe(true)
      expect(areSameType('oz', 'lb')).toBe(true)
    })
    
    it('should return true for same volume units', () => {
      expect(areSameType('ml', 'l')).toBe(true)
      expect(areSameType('cup', 'tbsp')).toBe(true)
    })
    
    it('should return false for different types', () => {
      expect(areSameType('g', 'ml')).toBe(false)
      expect(areSameType('oz', 'cup')).toBe(false)
    })
    
    it('should return false for unknown units', () => {
      expect(areSameType('unknown', 'g')).toBe(false)
    })
  })
  
  describe('convertUnit', () => {
    describe('weight conversions', () => {
      it('should convert metric weight units', () => {
        expect(convertUnit(1, 'kg', 'g')).toBe(1000)
        expect(convertUnit(1000, 'g', 'kg')).toBe(1)
        expect(convertUnit(1000, 'mg', 'g')).toBe(1)
      })
      
      it('should convert imperial weight units', () => {
        expect(convertUnit(1, 'lb', 'oz')).toBe(16)
        expect(convertUnit(16, 'oz', 'lb')).toBe(1)
      })
      
      it('should return null for cross-system conversions', () => {
        expect(convertUnit(1, 'g', 'oz')).toBeNull()
        expect(convertUnit(1, 'lb', 'kg')).toBeNull()
      })
    })
    
    describe('volume conversions', () => {
      it('should convert metric volume units', () => {
        expect(convertUnit(1, 'l', 'ml')).toBe(1000)
        expect(convertUnit(1000, 'ml', 'l')).toBe(1)
      })
      
      it('should convert imperial volume units', () => {
        expect(convertUnit(1, 'gal', 'fl oz')).toBe(128)
        expect(convertUnit(1, 'qt', 'fl oz')).toBe(32)
        expect(convertUnit(1, 'pt', 'fl oz')).toBe(16)
        expect(convertUnit(1, 'cup', 'fl oz')).toBe(8)
        expect(convertUnit(1, 'tbsp', 'fl oz')).toBe(0.5)
        expect(convertUnit(1, 'tsp', 'fl oz')).toBeCloseTo(1/6, 5)
      })
      
      it('should convert between imperial volume units', () => {
        expect(convertUnit(2, 'cup', 'tbsp')).toBe(32)
        expect(convertUnit(3, 'tsp', 'tbsp')).toBe(1)
      })
      
      it('should return null for cross-system conversions', () => {
        expect(convertUnit(1, 'ml', 'cup')).toBeNull()
        expect(convertUnit(1, 'l', 'gal')).toBeNull()
      })
    })
    
    it('should return null for count units', () => {
      expect(convertUnit(1, 'pinch', 'clove')).toBeNull()
    })
    
    it('should return null for unknown units', () => {
      expect(convertUnit(1, 'unknown', 'g')).toBeNull()
    })
    
    it('should return null for different types', () => {
      expect(convertUnit(1, 'g', 'ml')).toBeNull()
      expect(convertUnit(1, 'oz', 'cup')).toBeNull()
    })
  })
  
  describe('normalizeUnit', () => {
    it('should normalize metric weight to g', () => {
      expect(normalizeUnit('kg')).toBe('g')
      expect(normalizeUnit('g')).toBe('g')
      expect(normalizeUnit('mg')).toBe('g')
    })
    
    it('should normalize metric volume to ml', () => {
      expect(normalizeUnit('l')).toBe('ml')
      expect(normalizeUnit('ml')).toBe('ml')
    })
    
    it('should normalize imperial weight to oz', () => {
      expect(normalizeUnit('lb')).toBe('oz')
      expect(normalizeUnit('oz')).toBe('oz')
    })
    
    it('should normalize imperial volume to fl oz', () => {
      expect(normalizeUnit('cup')).toBe('fl oz')
      expect(normalizeUnit('tbsp')).toBe('fl oz')
      expect(normalizeUnit('tsp')).toBe('fl oz')
      expect(normalizeUnit('fl oz')).toBe('fl oz')
    })
    
    it('should return original for count units', () => {
      expect(normalizeUnit('pinch')).toBe('pinch')
      expect(normalizeUnit('clove')).toBe('clove')
    })
    
    it('should return original for unknown units', () => {
      expect(normalizeUnit('unknown')).toBe('unknown')
    })
  })
  
  describe('normalizeAmount', () => {
    it('should normalize metric weight amounts', () => {
      const result = normalizeAmount(1, 'kg')
      expect(result.value).toBe(1000)
      expect(result.unit).toBe('g')
    })
    
    it('should normalize imperial volume amounts', () => {
      const result = normalizeAmount(2, 'cup')
      expect(result.value).toBe(16)
      expect(result.unit).toBe('fl oz')
    })
    
    it('should return original if already normalized', () => {
      const result = normalizeAmount(100, 'g')
      expect(result.value).toBe(100)
      expect(result.unit).toBe('g')
    })
    
    it('should handle units without conversion', () => {
      const result = normalizeAmount(1, 'pinch')
      expect(result.value).toBe(1)
      expect(result.unit).toBe('pinch')
    })
  })
  
  describe('convertWeightToVolume', () => {
    it('should convert flour weight to volume', () => {
      // 240g flour ≈ 2 cups (120g per cup)
      const result = convertWeightToVolume(240, 'g', 'cup', 'flour')
      expect(result).toBeCloseTo(2, 1)
    })
    
    it('should convert sugar weight to volume', () => {
      // 200g sugar ≈ 1 cup (200g per cup)
      const result = convertWeightToVolume(200, 'g', 'cup', 'sugar')
      expect(result).toBeCloseTo(1, 1)
    })
    
    it('should return null for unknown ingredients', () => {
      expect(convertWeightToVolume(100, 'g', 'cup', 'unknown')).toBeNull()
    })
    
    it('should return null for non-weight-to-volume conversions', () => {
      expect(convertWeightToVolume(100, 'ml', 'cup', 'water')).toBeNull()
      expect(convertWeightToVolume(100, 'g', 'oz', 'flour')).toBeNull()
    })
  })
  
  describe('formatAmount', () => {
    it('should format whole numbers as integers', () => {
      expect(formatAmount(1)).toBe('1')
      expect(formatAmount(100)).toBe('100')
      expect(formatAmount(0)).toBe('0')
    })
    
    it('should format decimals with up to 2 places', () => {
      expect(formatAmount(1.5)).toBe('1.5')
      expect(formatAmount(1.25)).toBe('1.25')
      expect(formatAmount(1.123)).toBe('1.12')
    })
    
    it('should remove trailing zeros', () => {
      expect(formatAmount(1.0)).toBe('1')
      expect(formatAmount(1.10)).toBe('1.1')
      expect(formatAmount(1.20)).toBe('1.2')
    })
  })
})
