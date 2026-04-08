import type { TFunction } from 'i18next';
import type { Category } from '@/lib/logRegex';

const CATEGORY_LABEL_KEYS: Record<Category, string> = {
  dpsOut: 'categoryValue.dpsOut',
  dpsIn: 'categoryValue.dpsIn',
  logiOut: 'categoryValue.logiOut',
  logiIn: 'categoryValue.logiIn',
  capTransfered: 'categoryValue.capTransfered',
  capRecieved: 'categoryValue.capRecieved',
  capDamageOut: 'categoryValue.capDamageOut',
  capDamageIn: 'categoryValue.capDamageIn',
  mined: 'categoryValue.mined',
};

export function translateCategoryLabel(t: TFunction, category: Category): string {
  return t(CATEGORY_LABEL_KEYS[category], { defaultValue: category });
}
