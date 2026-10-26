import type { ComponentMap } from '@commercetools-labs/page-builder';
import { CategoryCarousel } from './CategoryCarousel';
import { CategoryFacets, CategoryPagination, CategoryProducts, CategoryTitle } from './CategoryListing';
import { Hero } from './Hero';
import { Message } from './Message';
import { ProductCarousel } from './ProductCarousel';
import { ProductDescription, ProductGallery, ProductPrice, ProductTitle } from './ProductDetail';

/** Block `type` → component. Every type in page-builder.catalog.json appears here. */
export const components: ComponentMap = {
  'content/hero': Hero,
  'content/message': Message,
  'product/product-carousel': ProductCarousel,
  'category/category-carousel': CategoryCarousel,
  'product/title': ProductTitle,
  'product/price': ProductPrice,
  'product/gallery': ProductGallery,
  'product/description': ProductDescription,
  'category/title': CategoryTitle,
  'category/products': CategoryProducts,
  'category/facets': CategoryFacets,
  'category/pagination': CategoryPagination,
};
