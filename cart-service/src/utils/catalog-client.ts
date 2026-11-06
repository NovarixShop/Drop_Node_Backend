import { logger } from '@shared/utils/logger';
import { internalHeaders } from '@shared/middlewares/internal.middleware';

export interface ICatalogProduct {
  _id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  images: string[];
  stock: number;
  isActive: boolean;
  category: any;
}

export class CatalogClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.CATALOG_SERVICE_URL || 'http://localhost:5002';
  }

  // Fetch a single product by ID (uses the bulk endpoint under the hood)
  public async getProductById(id: string): Promise<ICatalogProduct | null> {
    try {
      const products = await this.getProductsInBulk([id]);
      return products.length > 0 ? products[0] : null;
    } catch (error) {
      logger.error(`[CatalogClient] Failed to get product by ID: ${id}`, error);
      return null;
    }
  }

  // Fetch multiple products in bulk by their ObjectIds
  public async getProductsInBulk(ids: string[]): Promise<ICatalogProduct[]> {
    if (!ids || ids.length === 0) return [];
    
    // Remove duplicate IDs
    const uniqueIds = Array.from(new Set(ids));

    try {
      const response = await fetch(`${this.baseUrl}/api/internal/products/bulk`, {
        method: 'POST',
        headers: internalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ productIds: uniqueIds }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Catalog Service returned status ${response.status}: ${errText}`);
      }

      const body = (await response.json()) as {
        status: string;
        data: { products: ICatalogProduct[] };
      };

      return body.data.products;
    } catch (error) {
      logger.error(`[CatalogClient] Failed to fetch products in bulk:`, error);
      throw error;
    }
  }
}

export const catalogClient = new CatalogClient();
export default catalogClient;
