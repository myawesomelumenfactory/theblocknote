
import React from 'react';
import { useLanguage } from '../src/i18n/LanguageContext';

export default function Introduction() {
  const { t } = useLanguage();

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-6 text-center">
        <h1>
          <strong>Bitcoin</strong> {t('intro.is')} <strong>{t('intro.revolution')}</strong>.
        </h1>
      </div>
      <center>
        {t('intro.lead')} <strong>{t('intro.network')}</strong>
      </center>
    </div>
  );
}
