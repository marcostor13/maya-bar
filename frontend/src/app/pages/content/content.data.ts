import { ContentPage } from './content.model';
import { FUNCTION_PAGES } from './data/funciones';
import { INDUSTRY_PAGES } from './data/industrias';
import { COMPARISON_PAGES } from './data/comparativas';
import { GUIDE_PAGES } from './data/guias';

/** Todas las páginas de contenido, en el orden en que se listan en `/recursos`. */
export const CONTENT_PAGES: ContentPage[] = [
  ...FUNCTION_PAGES,
  ...INDUSTRY_PAGES,
  ...COMPARISON_PAGES,
  ...GUIDE_PAGES,
];

export function pageBySlug(slug: string): ContentPage | undefined {
  return CONTENT_PAGES.find((p) => p.slug === slug);
}
