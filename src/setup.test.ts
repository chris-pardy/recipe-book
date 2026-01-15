import { describe, it, expect } from 'vitest'

/**
 * Integration tests to verify project setup
 * These tests ensure all dependencies and configurations are working correctly
 */

describe('Project Setup', () => {
  describe('Dependencies', () => {
    it('should have @atproto/api installed', async () => {
      const atproto = await import('@atproto/api')
      expect(atproto).toBeDefined()
      expect(atproto.BskyAgent).toBeDefined()
    })

    it('should have idb installed', async () => {
      const idb = await import('idb')
      expect(idb).toBeDefined()
      expect(idb.openDB).toBeDefined()
    })

    it('should have Tailwind CSS configured', async () => {
      // Verify Tailwind config exists
      const fs = await import('fs/promises')
      const path = await import('path')
      const configPath = path.join(process.cwd(), 'tailwind.config.js')
      try {
        await fs.access(configPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('tailwind.config.js not found')
      }
    })

    it('should have PostCSS configured', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const configPath = path.join(process.cwd(), 'postcss.config.js')
      try {
        await fs.access(configPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('postcss.config.js not found')
      }
    })
  })

  describe('TypeScript Types', () => {
    it('should have recipe types file', async () => {
      // Types are compile-time only, so we just verify the module can be imported without errors
      await expect(import('./types/recipe')).resolves.toBeDefined()
    })

    it('should have collection types file', async () => {
      await expect(import('./types/collection')).resolves.toBeDefined()
    })

    it('should have ATProto types file', async () => {
      await expect(import('./types/atproto')).resolves.toBeDefined()
    })
  })

  describe('Services', () => {
    it('should export IndexedDB service', async () => {
      const services = await import('./services')
      expect(services).toBeDefined()
      expect(services.initDB).toBeDefined()
      expect(services.recipeDB).toBeDefined()
      expect(services.collectionDB).toBeDefined()
    })

    it('should export ATProto service', async () => {
      const services = await import('./services')
      expect(services).toBeDefined()
      expect(services.createAtProtoAgent).toBeDefined()
      expect(services.authenticateAgent).toBeDefined()
    })
  })

  describe('Folder Structure', () => {
    it('should have components directory', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const componentsPath = path.join(process.cwd(), 'src', 'components')
      try {
        await fs.access(componentsPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('components directory not found')
      }
    })

    it('should have hooks directory', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const hooksPath = path.join(process.cwd(), 'src', 'hooks')
      try {
        await fs.access(hooksPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('hooks directory not found')
      }
    })

    it('should have utils directory', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const utilsPath = path.join(process.cwd(), 'src', 'utils')
      try {
        await fs.access(utilsPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('utils directory not found')
      }
    })

    it('should have types directory', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const typesPath = path.join(process.cwd(), 'src', 'types')
      try {
        await fs.access(typesPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('types directory not found')
      }
    })

    it('should have services directory', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const servicesPath = path.join(process.cwd(), 'src', 'services')
      try {
        await fs.access(servicesPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('services directory not found')
      }
    })
  })

  describe('Configuration Files', () => {
    it('should have components.json for shadcn/ui', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const configPath = path.join(process.cwd(), 'components.json')
      try {
        await fs.access(configPath)
        expect(true).toBe(true)
      } catch {
        expect.fail('components.json not found')
      }
    })

    it('should have TypeScript path aliases configured', async () => {
      const fs = await import('fs/promises')
      const path = await import('path')
      const tsconfigPath = path.join(process.cwd(), 'tsconfig.app.json')
      const tsconfigContent = await fs.readFile(tsconfigPath, 'utf-8')
      // Remove comments before parsing
      const jsonContent = tsconfigContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
      const tsconfig = JSON.parse(jsonContent)
      expect(tsconfig.compilerOptions?.paths).toBeDefined()
      expect(tsconfig.compilerOptions?.paths['@/*']).toEqual(['./src/*'])
    })
  })
})
