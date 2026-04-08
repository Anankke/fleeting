/**
 * useEveNames.ts
 *
 * Composable that returns reactive, localised lookups for EVE Online entity names
 * sourced from the CCP Static Data Export (SDE) via i18next / Tolgee.
 *
 * Usage in components:
 *   const { shipName, shipCategory } = useEveNames();
 *   // shipName('Rifter')   → 'Rifter' (en) / 'Rifter' (de) / '里弗特' (zh) …
 *   // shipCategory('Rifter') → 'Frigate' (en) / 'Fregatte' (de) …
 *
 * Both functions accept the English ship name as it appears in EVE combat logs,
 * look up the type ID then convert it to a localised display string.
 *
 * Falls back to the English name / group name when no translation is available.
 */

import { useTranslation } from 'i18next-vue';
import { shipTypesByName, GROUP_NAMES } from '@/lib/shipTypes';
import { weaponTypesByName } from '@/lib/weaponTypes';

export function useEveNames() {
  const { t } = useTranslation('sde');

  /**
   * Localised ship type name.
   * Falls back to the English `typeName` when no translation exists.
   */
  function shipName(typeName: string): string {
    const st = shipTypesByName.get(typeName);
    if (!st) return typeName;
    const key = `type.${st.id}`;
    const result = t(key, { defaultValue: typeName });
    return result;
  }

  /**
   * Localised ship class / group name (e.g. Frigate, Cruiser …).
   * Falls back to the English group name when no translation exists.
   */
  function shipCategory(typeName: string): string {
    const st = shipTypesByName.get(typeName);
    if (!st) return '';
    const englishGroup = GROUP_NAMES.get(st.groupId) ?? '';
    const key = `group.${st.groupId}`;
    return t(key, { defaultValue: englishGroup });
  }

    /**
     * Localised weapon / module / drone name.
     * Falls back to the English `typeName` when no SDE entry is found.
     */
    function weaponName(typeName: string): string {
      if (!typeName) return typeName;
      const wt = weaponTypesByName.get(typeName);
      if (!wt) return typeName;
      return t(`type.${wt.id}`, { defaultValue: typeName });
    }

    return { shipName, shipCategory, weaponName };
}
