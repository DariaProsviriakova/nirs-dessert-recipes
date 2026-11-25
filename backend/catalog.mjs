import { normalizePlainText } from '../bm25/src/text.mjs';

// Conservative presentation boundary for SweetMate. The original corpus and BM25
// implementation remain intact. Category heuristics are not manual verification.
const savoryTitle = /(?:^|[\s-])(?:киш(?:а|ем)?|хачапури|пицц[а-я]*|чебурек[а-я]*|беляш[а-я]*|закусочн[а-я]*|несладк[а-я]*|овощ[а-я]*)(?=$|[\s-])/u;
const savoryIngredient = /(?:^|[\s-])(?:ветчин[а-я]*|бекон[а-я]*|колбас[а-я]*|сосиск[а-я]*|фарш[а-я]*|мяс[а-я]*|говядин[а-я]*|свинин[а-я]*|куриц[а-я]*|индейк[а-я]*|баранин[а-я]*|рыб[а-я]*|тунец|тунц[а-я]*|лосос[а-я]*|семг[а-я]*|кревет[а-я]*|краб[а-я]*|сельд[а-я]*|селед[а-я]*|шпрот[а-я]*|анчоус[а-я]*|баклажан[а-я]*|кабач[а-я]*|помидор[а-я]*|томат[а-я]*|огур[а-я]*|лук|лука|луком|чесно[а-я]*|капуст[а-я]*|гриб[а-я]*|шампиньон[а-я]*|майонез[а-я]*|овощ[а-я]*)(?=$|[\s-])/u;
const sweetFood = /(?:^|[\s-])(?:сахар[а-я]*|пудра|мед|меда|варень[а-я]*|джем[а-я]*|повидл[а-я]*|шоколад[а-я]*|какао[а-я]*|сгущенн[а-я]*|карамел[а-я]*|ванил[а-я]*|яблок[а-я]*|яблоч[а-я]*|груш[а-я]*|слива|сливы|сливу|сливовый|чернослив[а-я]*|вишн[а-я]*|ягод[а-я]*|клубник[а-я]*|малин[а-я]*|черник[а-я]*|клюкв[а-я]*|персик[а-я]*|абрикос[а-я]*|фрукт[а-я]*|банан[а-я]*|ананас[а-я]*|изюм[а-я]*|кураг[а-я]*|финик[а-я]*)(?=$|[\s-])/u;
const sweetCategory = /десерт|сладк|торт|пирожн|кекс|маффин|печень|бисквит|пирог|тарт|крем|морожен|конфет|пудинг|суфле/u;
export function isDessert(recipe) {
  const title=normalizePlainText(recipe.title);
  const categories=(recipe.categories || []).map(normalizePlainText);
  const ingredients=(recipe.ingredientNames || (recipe.ingredients || []).map(i=>i.name)).map(normalizePlainText);
  if (savoryTitle.test(title) || categories.some(c=>/закусочн|несладк/u.test(c))) return false;
  if (ingredients.some(i=>savoryIngredient.test(i) || (/курин/u.test(i) && !/яйц|белок|желток/u.test(i)) || /перец болгарский|перец сладкий|соевый соус/u.test(i))) return false;
  const root=normalizePlainText(recipe.rootCategory || categories[0] || '');
  if (root==='десерты' || categories.includes('десерты')) return true;
  // Butter/cream alone must never qualify a savory pastry as a dessert.
  const hasSweetFood=sweetFood.test(title) || ingredients.some(i=>sweetFood.test(i));
  return hasSweetFood && (sweetCategory.test(title) || categories.some(c=>sweetCategory.test(c)));
}

export function dessertIndex(index) {
  const documents=[],remap=new Int32Array(index.documents.length).fill(-1);
  const totals=Object.fromEntries(Object.keys(index.scoring.fieldBoosts).map(field=>[field,0]));
  for (let oldIndex=0;oldIndex<index.documents.length;oldIndex++) {
    const doc=index.documents[oldIndex];
    if (!isDessert(doc.recipe)) continue;
    remap[oldIndex]=documents.length;documents.push(doc);
    for (const field of Object.keys(totals)) totals[field]+=doc.lengths[field] || 0;
  }
  const terms={};
  for (const [term,postings] of Object.entries(index.terms)) {
    const eligible=[];
    for (const [oldIndex,frequencies] of postings) {
      if (remap[oldIndex]>=0) eligible.push([remap[oldIndex],frequencies]);
    }
    if (eligible.length) terms[term]=eligible;
  }
  return {...index,documents,terms,documentCount:documents.length,
    averageLengths:Object.fromEntries(Object.entries(totals).map(([field,total])=>[field,documents.length ? total/documents.length : 0]))};
}
