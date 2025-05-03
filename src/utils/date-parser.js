import { parse, isValid } from 'date-fns';
import { enUS, fr, es, de, it } from 'date-fns/locale';

export function parseDateFlexibly(dateStr) {
    // Common date formats to try
    const formats = [
      'd MMMM yyyy', // 21 juillet 2021
      'MMMM d, yyyy', // juillet 21, 2021
      'yyyy-MM-dd',   // 2021-07-21
      'dd/MM/yyyy',   // 21/07/2021
      'MM/dd/yyyy',   // 07/21/2021
      'd MMM yyyy',   // 21 juil 2021
      'yyyy.MM.dd',   // 2021.07.21
      'dd.MM.yyyy',   // 21.07.2021
      'dd-MM-yyyy',   // 21-07-2021
      'yyyy/MM/dd',   // 2021/07/21
    ];
    
    // Locales to try
    const locales = [enUS, fr, es, de, it];
    
    // Try each format with each locale
    for (const format of formats) {
      for (const locale of locales) {
        try {
          const parsed = parse(dateStr, format, new Date(), { locale });
          
          if (isValid(parsed)) {
            return parsed
          }
        } catch (error) {
          // Continue to next combination if parsing fails
          continue;
        }
      }
    }
    
    return null;
  }