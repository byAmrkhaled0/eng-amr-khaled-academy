'use strict';
// Exact alternatives only: no fuzzy/AI grading and no answer keys on the client.
function normalizeFillAnswer(value){
  return String(value??'').normalize('NFKC').replace(/[٠-٩۰-۹]/g,char=>'٠١٢٣٤٥٦٧٨٩'.includes(char)?'٠١٢٣٤٥٦٧٨٩'.indexOf(char):'۰۱۲۳۴۵۶۷۸۹'.indexOf(char)).trim().replace(/\s+/gu,' ').toLowerCase();
}
function gradeFillAnswer(answer,modelAnswer){
  const accepted=String(modelAnswer??'').split(/[\n|]+/).map(normalizeFillAnswer).filter(Boolean);
  if(!accepted.length)return null; // Legacy/malformed key: preserve manual review.
  const normalized=normalizeFillAnswer(answer);
  return normalized!==''&&accepted.includes(normalized);
}
module.exports={normalizeFillAnswer,gradeFillAnswer};
