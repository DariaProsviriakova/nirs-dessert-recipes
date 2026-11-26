import { FormEvent, StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api, ApiError, type Account } from './api';
import { AdminPanel } from './AdminPanel';

type MacroValues = { kcal: number | null; protein: number | null; fats: number | null; carbs: number | null };
type ChatContext = {
  version: number; ingredients: string[]; excludedIngredients: string[]; topic: string;
  displayedIds: string[]; selectedRecipeId: string | null; servings: number | null;
  filters: Record<string, unknown>; sort: string;
  knownRecipeIds?: string[]; recipeGroups?: string[][];
};
type NutritionReply = { recipeId: string; title: string; basis: string; basisLabel: string; values: MacroValues | null };
type Recipe = {
  id: string;
  title: string;
  description: string;
  image: string;
  time: string;
  difficulty: string;
  tag: string;
  ingredients: string[];
  steps: string[];
  requestCount: number;
  aliases: string[];
  sourceUrl?: string | null;
  checked?: boolean;
  servings?: number | null;
  nutrition?: { per100g?: MacroValues | null; perServing?: MacroValues | null; wholeDish?: MacroValues | null };
  matchedIngredients?: string[];
  additionalIngredients?: string[];
  ingredientEntries?: { name: string; amount: string | null }[];
  originalServings?: number | null;
  scaled?: boolean;
  portionNote?: string | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  recipes?: Recipe[];
  recipeDetail?: Recipe;
  context?: ChatContext;
  nutrition?: NutritionReply | null;
  llmStatus?: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
  context?: ChatContext;
};

type AuthMode = 'login' | 'register';
type View = 'chat' | 'auth' | 'profile' | 'admin';

const storageKeys = {
  chats: 'sweetmate:v2:chats',
  favorites: 'sweetmate:v2:favorites',
};

const guestExampleQuestion =
  'У меня есть бананы, овсяные хлопья и немного тёмного шоколада. Что можно приготовить на десерт?';

const exampleQuestion = 'У меня есть банан и молоко. Что можно приготовить?';

const recipeLibrary: Recipe[] = [
  {
    id: 'banana-oat-cookies',
    title: 'Бананово-овсяное печенье',
    description:
      'Мягкое печенье без добавленного сахара: бананы дают сладость, овсяные хлопья - основу, а темный шоколад делает вкус насыщенным.',
    image: '/images/banana-oat-cookies.jpg',
    time: '30 мин',
    difficulty: 'Легко',
    tag: 'Полезный десерт',
    ingredients: ['2 спелых банана', '120 г овсяных хлопьев', '40 г темного шоколада', '1 ч. л. корицы'],
    steps: [
      'Разомните бананы вилкой до мягкого пюре.',
      'Добавьте овсяные хлопья, корицу и рубленый темный шоколад.',
      'Сформируйте небольшие печенья и выложите на пергамент.',
      'Выпекайте 18-20 минут при 180 градусах.'
    ],
    requestCount: 18420,
    aliases: ['печенье', 'банановое печенье', 'овсяное печенье'],
  },
  {
    id: 'banana-muffins',
    title: 'Банановые маффины с овсянкой',
    description:
      'Питательные маффины для уютного перекуса. Можно испечь в маленьких формах и добавить кусочки шоколада сверху.',
    image: '/images/banana-muffins.jpg',
    time: '20 мин',
    difficulty: 'Легко',
    tag: 'Подходит детям',
    ingredients: ['2 банана', '1 яйцо', '90 г овсяной муки', '60 мл молока', '30 г шоколада', '1 ч. л. разрыхлителя'],
    steps: [
      'Смешайте бананы, яйцо и молоко до однородности.',
      'Добавьте овсяную муку, разрыхлитель и кусочки шоколада.',
      'Разложите тесто по формочкам.',
      'Выпекайте 16-18 минут при 180 градусах.'
    ],
    requestCount: 14280,
    aliases: ['маффины', 'банановые маффины', 'кексы'],
  },
  {
    id: 'chocolate-bites',
    title: 'Бананово-шоколадные шарики',
    description:
      'Быстрый десерт без выпечки: смешайте банан, хлопья и шоколадную крошку, охладите и подавайте к чаю.',
    image: '/images/chocolate-bites.jpg',
    time: '15 мин',
    difficulty: 'Очень просто',
    tag: 'Без выпечки',
    ingredients: ['1 банан', '80 г овсяных хлопьев', '50 г темного шоколада', '1 ст. л. какао'],
    steps: [
      'Разомните банан и смешайте с овсяными хлопьями.',
      'Добавьте какао и растопленный шоколад.',
      'Скатайте шарики и уберите в холодильник на 10 минут.',
      'Подавайте охлажденными.'
    ],
    requestCount: 21340,
    aliases: ['шарики', 'трюфели', 'шоколадные шарики', 'без выпечки'],
  },
  {
    id: 'tiramisu',
    title: 'Тирамису',
    description:
      'Классический кофейный десерт с нежным кремом, печеньем савоярди и тонким слоем какао.',
    image: '/images/tiramisu.jpg',
    time: '35 мин',
    difficulty: 'Средне',
    tag: 'Классика Италии',
    ingredients: ['250 г маскарпоне', '150 г савоярди', '2 яйца', '60 г сахара', '180 мл кофе', 'какао'],
    steps: [
      'Взбейте желтки с сахаром, затем смешайте с маскарпоне.',
      'Отдельно взбейте белки и аккуратно введите в крем.',
      'Окуните савоярди в холодный кофе и выложите первый слой.',
      'Чередуйте печенье и крем, завершите слоем какао.',
      'Охладите минимум 3 часа.'
    ],
    requestCount: 32580,
    aliases: ['тирамису', 'tiramisu', 'кофейный десерт'],
  },
  {
    id: 'chocolate-muffin',
    title: 'Шоколадные маффины',
    description:
      'Мягкие маффины с насыщенным шоколадным вкусом и кусочками темного шоколада внутри.',
    image: '/images/chocolate-muffin.jpg',
    time: '28 мин',
    difficulty: 'Легко',
    tag: 'Быстро и вкусно',
    ingredients: ['160 г муки', '35 г какао', '90 г сахара', '1 яйцо', '120 мл молока', '60 г шоколада'],
    steps: [
      'Смешайте муку, какао, сахар и разрыхлитель.',
      'Добавьте яйцо, молоко и растопленное масло.',
      'Вмешайте кусочки шоколада.',
      'Выпекайте в формах 18-20 минут при 180 градусах.'
    ],
    requestCount: 27910,
    aliases: ['шоколад', 'шоколадные маффины', 'маффины', 'кексы'],
  },
  {
    id: 'apple-pie',
    title: 'Яблочный пирог',
    description:
      'Домашний пирог с яблоками, корицей и мягкой румяной основой для семейного чаепития.',
    image: '/images/apple-pie.jpg',
    time: '50 мин',
    difficulty: 'Средне',
    tag: 'Теплый аромат осени',
    ingredients: ['4 яблока', '180 г муки', '120 г сахара', '2 яйца', '80 г масла', 'корица'],
    steps: [
      'Нарежьте яблоки тонкими ломтиками и посыпьте корицей.',
      'Взбейте яйца с сахаром, добавьте масло и муку.',
      'Выложите тесто и яблоки в форму.',
      'Выпекайте 35-40 минут при 180 градусах.'
    ],
    requestCount: 24670,
    aliases: ['яблочный пирог', 'пирог', 'яблоки', 'шарлотка'],
  },
  {
    id: 'eclairs',
    title: 'Эклеры',
    description:
      'Воздушные заварные пирожные с ванильным кремом и шоколадной глазурью.',
    image: '/images/eclairs.jpg',
    time: '1 ч 20 мин',
    difficulty: 'Сложно',
    tag: 'Французская нежность',
    ingredients: ['120 г муки', '100 г масла', '4 яйца', '250 мл молока', '70 г сахара', 'ваниль', 'шоколад'],
    steps: [
      'Приготовьте заварное тесто из воды, масла и муки.',
      'По одному вмешайте яйца и отсадите полоски на пергамент.',
      'Выпекайте до сухой румяной корочки.',
      'Сварите ванильный крем и наполните эклеры.',
      'Покройте шоколадной глазурью.'
    ],
    requestCount: 19760,
    aliases: ['эклеры', 'заварные пирожные', 'пирожные'],
  },
];

const bananaRecipes = recipeLibrary.slice(0, 3);

function normalizeGuestRecipeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getGuestRecipeScore(recipe: Recipe, question: string) {
  const normalizedQuestion = normalizeGuestRecipeText(question);
  const words = normalizedQuestion.split(/[^a-zа-я0-9]+/i).filter(Boolean);
  const title = normalizeGuestRecipeText(recipe.title);
  const aliases = recipe.aliases.map(normalizeGuestRecipeText);
  const searchable = normalizeGuestRecipeText(
    [recipe.title, recipe.description, recipe.tag, recipe.difficulty, ...recipe.ingredients, ...recipe.aliases].join(' '),
  );

  const exactBonus = [title, ...aliases].some((item) => normalizedQuestion.includes(item)) ? 40 : 0;
  const wordScore = words.reduce((score, word) => {
    if (title.includes(word)) {
      return score + 8;
    }

    if (aliases.some((alias) => alias.includes(word))) {
      return score + 6;
    }

    if (searchable.includes(word)) {
      return score + 2;
    }

    return score;
  }, 0);

  return exactBonus + wordScore;
}

function findGuestExactRecipe(question: string) {
  const normalizedQuestion = normalizeGuestRecipeText(question);

  return recipeLibrary.find((recipe) => normalizedQuestion.includes(normalizeGuestRecipeText(recipe.title)));
}

function selectGuestRecipesForQuestion(question: string) {
  return recipeLibrary
    .map((recipe) => ({ recipe, score: getGuestRecipeScore(recipe, question) }))
    .sort((a, b) => b.score - a.score || b.recipe.requestCount - a.recipe.requestCount)
    .slice(0, 3)
    .map(({ recipe }) => ({ ...recipe }));
}

function getGuestResponseForQuestion(question: string) {
  const exactRecipe = findGuestExactRecipe(question);

  if (exactRecipe) {
    return {
      text: `Конечно, вот полный рецепт: ${exactRecipe.title}.`,
      recipeDetail: { ...exactRecipe },
    };
  }

  return {
    text:
      'Я подобрала 3 варианта из библиотеки рецептов. Выберите карточку, и я открою полный рецепт следующим сообщением в чате.',
    recipes: selectGuestRecipesForQuestion(question),
  };
}

const mockResponses: Message[] = [
  {
    id: 'response-bananas',
    role: 'assistant',
    ...getGuestResponseForQuestion(guestExampleQuestion),
  },
  {
    id: 'response-berries',
    role: 'assistant',
    text:
      'Для ягод лучше выбрать десерты с нежной основой и легкой кислинкой. Вот варианты, которые выглядят празднично, но готовятся без лишней суеты.',
    recipes: [
      {
        ...bananaRecipes[0],
        id: 'berry-cookies',
        title: 'Овсяное печенье с ягодами',
        description:
          'Сочные ягоды освежают мягкую овсяную основу, а шоколадная крошка добавляет десерту глубину.',
        time: '25 мин',
        tag: 'К чаю',
        requestCount: 12110,
        aliases: ['ягодное печенье', 'печенье с ягодами'],
      },
      {
        ...bananaRecipes[1],
        id: 'berry-muffins',
        title: 'Маффины с бананом и малиной',
        description:
          'Нежные маффины с фруктовой сладостью и яркой ягодной ноткой. Хороши теплыми и остывшими.',
        time: '28 мин',
        tag: 'Нежная выпечка',
        requestCount: 11640,
        aliases: ['ягодные маффины', 'маффины с малиной'],
      },
      {
        ...bananaRecipes[2],
        id: 'berry-bites',
        title: 'Шоколадные шарики с ягодной серединой',
        description:
          'Быстрые конфеты без выпечки: внутри ягода, снаружи овсяно-шоколадная оболочка.',
        time: '18 мин',
        tag: 'Без духовки',
        requestCount: 9870,
        aliases: ['ягодные шарики', 'конфеты с ягодами'],
      },
    ],
  },
  {
    id: 'response-fast',
    role: 'assistant',
    text:
      'Если хочется сладкого прямо сейчас, лучше выбрать десерты без долгой выпечки. Эти идеи можно собрать из простых продуктов.',
    recipes: [
      {
        ...bananaRecipes[2],
        id: 'quick-bites',
        title: 'Шоколадно-банановые трюфели',
        description:
          'Смешайте банан, овсяные хлопья и шоколад, скатайте шарики и охладите десять минут.',
        time: '12 мин',
        difficulty: 'Очень просто',
        requestCount: 15520,
        aliases: ['трюфели', 'быстрые трюфели'],
      },
      {
        ...bananaRecipes[0],
        id: 'pan-cookies',
        title: 'Мини-печенье на сковороде',
        description:
          'Небольшие овсяные лепешки с бананом можно приготовить без духовки на сухой сковороде.',
        time: '18 мин',
        tag: 'Быстро',
        requestCount: 13210,
        aliases: ['печенье на сковороде', 'быстрое печенье'],
      },
      {
        ...bananaRecipes[1],
        id: 'cupcake',
        title: 'Кекс в кружке с шоколадом',
        description:
          'Нежный порционный десерт с банановой основой и шоколадной шапочкой.',
        time: '10 мин',
        tag: 'Порционный десерт',
        requestCount: 17630,
        aliases: ['кекс в кружке', 'быстрый кекс'],
      },
    ],
  },
];

type FavoriteRecipe = {
  chatId: string;
  messageId: string;
  recipe: Recipe;
};

const initialChat: Chat = {
  id: 'chat-example',
  title: 'Идеи из бананов и овсянки',
  messages: [
    {
      id: 'example-user',
      role: 'user',
      text: guestExampleQuestion,
    },
    mockResponses[0],
  ],
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getScopedStorageKey(key: string, ownerEmail: string) {
  return `${key}:${normalizeEmail(ownerEmail)}`;
}

function getGuestChats() {
  return [initialChat];
}

function getStoredChats(ownerEmail: string) {
  return ownerEmail ? readStorage(getScopedStorageKey(storageKeys.chats, ownerEmail), [createEmptyChat()]) : getGuestChats();
}

function getStoredFavorites(ownerEmail: string) {
  return ownerEmail ? readStorage<string[]>(getScopedStorageKey(storageKeys.favorites, ownerEmail), []) : [];
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeChatTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 38 ? `${clean.slice(0, 38)}...` : clean || 'Новый чат';
}

function createEmptyChat(): Chat {
  return {
    id: createId('chat'),
    title: 'Новый чат',
    messages: [
      {
        id: createId('assistant'),
        role: 'assistant',
        text:
          'Напишите, что есть под рукой. Например: «У меня есть банан и молоко. Что можно приготовить?» Затем можно уточнить: «Где меньше калорий?», выбрать рецепт и попросить: «Покажи КБЖУ» или «На 6 человек».',
      },
    ],
  };
}

function Logo() {
  return (
    <div className="logo" aria-label="SweetMate">
      <span className="logo__mark">S</span>
      <span>
        <strong>SweetMate</strong>
        <small>Сладкие идеи</small>
      </span>
    </div>
  );
}

function RecipeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={(event) => {
        const image = event.currentTarget;
        image.onerror = null;
        image.src = '/images/recipe-placeholder.svg';
      }}
    />
  );
}

function chatContext(chat: Chat): ChatContext {
  const saved = chat.context ?? [...chat.messages].reverse().find(message => message.context)?.context;
  const lastRecipes = [...chat.messages].reverse().find(message => message.recipes?.length || message.recipeDetail);
  const fallback: ChatContext = {
    version: 3, ingredients: [], excludedIngredients: [], topic: '',
    displayedIds: lastRecipes?.recipes?.map(recipe => recipe.id) ?? (lastRecipes?.recipeDetail ? [lastRecipes.recipeDetail.id] : []),
    selectedRecipeId: lastRecipes?.recipeDetail?.id ?? null, servings: lastRecipes?.recipeDetail?.servings ?? null,
    filters: {}, sort: 'relevance',
  };
  const memoryContext = chat.context?.recipeGroups ? chat.context : [...chat.messages].reverse().find(message => message.context?.recipeGroups)?.context;
  const groups = memoryContext?.recipeGroups?.map(group => [...group]) ?? [];
  const ids = new Set<string>(saved?.knownRecipeIds ?? []);
  for (const message of chat.messages) {
    const recipes = [...(message.recipes ?? []), ...(message.recipeDetail ? [message.recipeDetail] : [])];
    recipes.forEach(recipe => ids.add(recipe.id));
    if (message.nutrition) ids.add(message.nutrition.recipeId);
    if (!memoryContext && message.recipes?.length) {
      const group = message.recipes.map(recipe => recipe.id);
      if (JSON.stringify(groups[groups.length - 1]) !== JSON.stringify(group)) groups.push(group);
    }
  }
  return { ...(saved ?? fallback), knownRecipeIds: [...ids], recipeGroups: groups };
}
function NutritionTable({ data }: { data: NutritionReply }) {
  const format = (value: number | null | undefined) => value == null ? 'Нет данных' : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return <section className="nutrition-result" aria-label={'КБЖУ: ' + data.title}>
    <h3>{data.title}: КБЖУ {data.basisLabel}</h3>
    {!data.values ? <p>В источнике нет данных на этой базе. Значения не рассчитывались догадками.</p> :
      <dl className="nutrition-values">
        <div><dt>Калории</dt><dd>{format(data.values.kcal)} ккал</dd></div>
        <div><dt>Белки</dt><dd>{format(data.values.protein)} г</dd></div>
        <div><dt>Жиры</dt><dd>{format(data.values.fats)} г</dd></div>
        <div><dt>Углеводы</dt><dd>{format(data.values.carbs)} г</dd></div>
      </dl>}
    <small>По данным источника. База расчёта указана явно.</small>
  </section>;
}

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  return (
    <section className="recipe-detail" aria-label={`Полный рецепт: ${recipe.title}`}>
      <div className="recipe-detail__header">
        <div>
          <p className="eyebrow">Полный рецепт</p>
          <h3>{recipe.title}</h3>
        </div>
        <span>{recipe.sourceUrl ? 'Данные источника' : 'Демонстрационный пример'}</span>
      </div>
      <RecipeImage src={recipe.image} alt={recipe.title} className="recipe-detail__image" />
      <p>{recipe.description}</p>
      {recipe.sourceUrl && <p><a href={recipe.sourceUrl} target="_blank" rel="noreferrer">Источник: Поварёнок</a> · Рецепт не проходил ручную проверку.</p>}
      {recipe.servings != null && <p>Порций: {recipe.servings}{recipe.scaled ? ' · ингредиенты пересчитаны с ' + recipe.originalServings + ' порций' : ''}</p>}
      {recipe.portionNote && <p>{recipe.portionNote}</p>}
      {recipe.scaled && <p>Количества берите из пересчитанного списка ингредиентов. Текст шагов сохранён из исходного рецепта.</p>}
      {recipe.nutrition?.per100g && <p>На 100 г (по источнику): ккал {recipe.nutrition.per100g.kcal ?? 'нет данных'}, белки {recipe.nutrition.per100g.protein ?? 'нет данных'} г, жиры {recipe.nutrition.per100g.fats ?? 'нет данных'} г, углеводы {recipe.nutrition.per100g.carbs ?? 'нет данных'} г.</p>}
      {!recipe.ingredients.length && <p>Ингредиенты в источнике не указаны.</p>}
      {!recipe.steps.length && <p>Шаги в источнике не указаны. Проверьте оригинал рецепта.</p>}
      <div className="recipe-detail__grid">
        <div>
          <h4>Ингредиенты</h4>
          <ul>
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient}>{ingredient}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Шаги</h4>
          <ol>
            {recipe.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [user, setUser] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [accountId, setAccountId] = useState('');
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [authLoading, setAuthLoading] = useState(true);
  const [authPending, setAuthPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [popularDesserts, setPopularDesserts] = useState<Recipe[]>([]);
  const pendingRequest = useRef<AbortController | null>(null);
  const identity = useRef('');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [chats, setChats] = useState<Chat[]>(getGuestChats);
  const [activeChatId, setActiveChatId] = useState(initialChat.id);
  const [input, setInput] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatNewPassword, setRepeatNewPassword] = useState('');
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const previousMessageStateRef = useRef<{ chatId: string; messageCount: number } | null>(null);
  const wasViewingChatRef = useRef(false);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0] ?? initialChat;
  const isGuest = !user;
  const sidebarPopular = (isGuest || isDemo) ? [...recipeLibrary].sort((a, b) => b.requestCount - a.requestCount).slice(0, 4) : popularDesserts;
  const displayName = user || 'Гость';
  const userInitial = user ? user.slice(0, 1).toUpperCase() : '?';
  function acceptAccount(account: Account) {
    setIsDemo(account.demo === true);
    identity.current = account.id;
    setUser(account.displayName); setUserEmail(account.email); setAccountId(account.id); setRole(account.role);
    setProfileNameInput(account.displayName);
    const saved = getStoredChats(account.id);
    setChats(saved); setActiveChatId(saved[0]?.id || initialChat.id);
    setFavorites(getStoredFavorites(account.id));
    setView(account.role === 'admin' ? 'admin' : 'chat');
    setRequestError('');
  }

  function clearAccount() {
    setIsDemo(false);
    identity.current = '';
    pendingRequest.current?.abort(); pendingRequest.current = null; setPending(false);
    setUser(''); setUserEmail(''); setAccountId(''); setRole(null);
    setChats(getGuestChats()); setActiveChatId(initialChat.id); setFavorites([]);
    setInput(''); setProfileNameInput(''); setUserMenuOpen(false); setPopularDesserts([]); setView('chat');
  }

  useEffect(() => {
    const controller = new AbortController();
    api<{ demoEnabled: boolean }>('/health', { signal: controller.signal }).then(value => setDemoEnabled(value.demoEnabled)).catch(() => {});
    api<Account>('/auth/me', { signal: controller.signal }).then(acceptAccount).catch(error => {
      if (error instanceof ApiError && error.status !== 401) setRequestError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setAuthLoading(false); });
    return () => { controller.abort(); pendingRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    api<Recipe[]>('/recipes/popular', { signal: controller.signal }).then(setPopularDesserts).catch(() => {});
    return () => controller.abort();
  }, [accountId, pending]);

  useEffect(() => {
    const messages = messagesRef.current;

    if (view !== 'chat' || !messages) {
      wasViewingChatRef.current = false;
      return;
    }

    const previousState = previousMessageStateRef.current;
    previousMessageStateRef.current = {
      chatId: activeChat.id,
      messageCount: activeChat.messages.length,
    };

    if (!wasViewingChatRef.current || !previousState || previousState.chatId !== activeChat.id) {
      messages.scrollTo({ top: 0, behavior: 'auto' });
      wasViewingChatRef.current = true;
      return;
    }

    wasViewingChatRef.current = true;

    if (previousState.messageCount < activeChat.messages.length) {
      messages.scrollTo({ top: messages.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }, [activeChat.id, activeChat.messages.length, view]);

  const favoriteRecipes = useMemo(() => {
    const allRecipes = chats.flatMap((chat) =>
      chat.messages.flatMap((message) => {
        const messageRecipes = [...(message.recipes ?? []), ...(message.recipeDetail ? [message.recipeDetail] : [])];

        return messageRecipes.map((recipe) => ({
          chatId: chat.id,
          messageId: message.id,
          recipe,
        }));
      }),
    );

    return favorites
      .map((favoriteId) => {
        const storedRecipe = allRecipes.find((item) => item.recipe.id === favoriteId);

        if (storedRecipe) {
          return storedRecipe;
        }

        const libraryRecipe = recipeLibrary.find((recipe) => recipe.id === favoriteId);

        return libraryRecipe
          ? { chatId: activeChatId, messageId: `library-${libraryRecipe.id}`, recipe: libraryRecipe }
          : undefined;
      })
      .filter((item): item is FavoriteRecipe => Boolean(item));
  }, [activeChatId, chats, favorites]);

  useEffect(() => {
    if (accountId) {
      try { localStorage.setItem(getScopedStorageKey(storageKeys.chats, accountId), JSON.stringify(chats)); }
      catch { setRequestError('Не удалось сохранить историю в этом браузере. Проверьте доступное место и настройки хранения данных.'); }
    }
  }, [chats, accountId]);

  useEffect(() => {
    if (accountId) {
      try { localStorage.setItem(getScopedStorageKey(storageKeys.favorites, accountId), JSON.stringify(favorites)); }
      catch { setRequestError('Не удалось сохранить избранное в этом браузере. Проверьте настройки хранения данных.'); }
    }
  }, [favorites, accountId]);

  async function handleDemoLogin(demoRole: 'user' | 'admin') {
    if (authPending) return;
    setAuthPending(true); setAuthError(''); setRequestError('');
    try {
      const account = await api<Account>('/demo/login', { method: 'POST', body: JSON.stringify({ role: demoRole }) });
      acceptAccount(account); setSidebarOpen(false);
    } catch (error) {
      if (view === 'auth') setAuthError((error as Error).message);
      else setRequestError((error as Error).message);
    } finally { setAuthPending(false); }
  }

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    if (authPending) return;
    setAuthError(''); setDuplicateEmail(false);
    if (!email.trim()) { setAuthError('Укажите электронную почту.'); emailInputRef.current?.focus(); return; }
    if (!password) { setAuthError('Укажите пароль.'); return; }
    if (authMode === 'register' && password !== confirmPassword) { setAuthError('Пароли не совпадают.'); return; }
    setAuthPending(true);
    try {
      const account = await api<Account>('/auth/' + authMode, { method: 'POST',
        body: JSON.stringify({ email, password, confirmPassword }) });
      acceptAccount(account); setPassword(''); setConfirmPassword('');
    } catch (error) {
      setAuthError((error as Error).message);
      setDuplicateEmail(error instanceof ApiError && error.status === 409);
    }
    finally { setAuthPending(false); }
  }

  async function handleLogout() {
    try { await api('/auth/logout', { method: 'POST', body: '{}' }); clearAccount(); }
    catch (error) { setRequestError((error as Error).message); }
  }

  function resetProfileForm(message = '') {
    setProfileNameInput(user);
    setCurrentPassword('');
    setNewPassword('');
    setRepeatNewPassword('');
    setProfileMessage(message);
  }

  function handleNewChat() {
    if (isGuest) {
      return;
    }

    const chat = createEmptyChat();

    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
    setInput('');
    setSidebarOpen(false);
    setView('chat');
  }

  function handleDeleteChat(chatId: string) {
    if (isGuest) {
      return;
    }

    const remainingChats = chats.filter((chat) => chat.id !== chatId);
    const nextChats = remainingChats.length ? remainingChats : [createEmptyChat()];

    setChats(nextChats);
    setActiveChatId((currentId) =>
      currentId === chatId || !nextChats.some((chat) => chat.id === currentId) ? nextChats[0].id : currentId,
    );
    setView('chat');
  }

  async function handleNameChange(event: FormEvent) {
    event.preventDefault();
    try {
      const account = await api<Account>('/profile', { method: 'PATCH', body: JSON.stringify({ displayName: profileNameInput }) });
      setUser(account.displayName); setProfileNameInput(account.displayName); setProfileMessage('Имя профиля обновлено.');
    } catch (error) { setProfileMessage((error as Error).message); }
  }

  async function handlePasswordChange(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/profile/password', { method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword: repeatNewPassword }) });
      resetProfileForm('Пароль обновлён. Остальные сессии завершены.');
    } catch (error) { setProfileMessage((error as Error).message); }
  }

  async function handleDeleteAccount() {
    if (!accountId || !window.confirm('Удалить учётную запись, её чаты и избранное?')) return;
    try {
      await api('/profile', { method: 'DELETE', body: '{}' });
      localStorage.removeItem(getScopedStorageKey(storageKeys.chats, accountId));
      localStorage.removeItem(getScopedStorageKey(storageKeys.favorites, accountId));
      clearAccount();
    } catch (error) { setProfileMessage((error as Error).message); }
  }

  async function submitQuestion(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (pendingRequest.current || isGuest) return;
    setRequestError('');
    if (!question) { setRequestError('Введите вопрос о десертах.'); return; }
    if ([...rawQuestion].length > 500) { setRequestError('Вопрос не должен превышать 500 символов.'); return; }
    const chatId = activeChat.id, owner = identity.current;
    const controller = new AbortController(); pendingRequest.current = controller; setPending(true);
    const userMessage: Message = { id: createId('user'), role: 'user', text: question };
    setChats(current => current.map(chat => chat.id === chatId ? {
      ...chat, title: chat.title === 'Новый чат' ? makeChatTitle(question) : chat.title,
      messages: [...chat.messages, userMessage],
    } : chat));
    setView('chat'); setSidebarOpen(false);
    try {
      const result = await api<{ answer: string; recipes: Recipe[]; recipeDetail: Recipe | null; status: string; llmStatus: string; context: ChatContext; nutrition: NutritionReply | null }>(
        '/search', { method: 'POST', body: JSON.stringify({
          query: rawQuestion, context: chatContext(activeChat),
          history: activeChat.messages.slice(-6).map(message => ({ role: message.role, text: message.text.slice(0, 400) })),
        }), signal: controller.signal });
      if (identity.current !== owner) return;
      const answer: Message = { id: createId('assistant'), role: 'assistant', text: result.answer, context: result.context, nutrition: result.nutrition, llmStatus: result.llmStatus,
        ...(result.recipeDetail ? { recipeDetail: result.recipeDetail } : { recipes: result.recipes }) };
      setChats(current => current.map(chat => chat.id === chatId ? {
        ...chat, context: result.context,
        messages: result.status === 'empty' ? chat.messages : [...chat.messages, answer],
      } : chat));
      setInput(current => current === rawQuestion ? '' : current);
    } catch (error) {
      if (controller.signal.aborted || identity.current !== owner) return;
      setRequestError((error as Error).message);
      if (error instanceof ApiError && error.status === 401) clearAccount();
    } finally {
      if (pendingRequest.current === controller) { pendingRequest.current = null; setPending(false); }
    }
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    submitQuestion(input);
  }

  function getRecipeDetailMessage(recipe: Recipe, chat: Chat = activeChat): Message {
    return {
      id: createId('assistant'),
      role: 'assistant',
      text: `Вот полный рецепт: ${recipe.title}.`,
      recipeDetail: { ...recipe },
      context: { ...chatContext(chat), selectedRecipeId: recipe.id },
    };
  }

  function openRecipeInChat(recipe: Recipe) {
    if (isGuest) { setAuthMode('login'); setView('auth'); return; }
    const requestMessage: Message = {
      id: createId('user'),
      role: 'user',
      text: `Открыть полный рецепт: ${recipe.title}`,
    };

    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== activeChat.id) {
          return chat;
        }

        return {
          ...chat,
          context: { ...chatContext(chat), selectedRecipeId: recipe.id },
          messages: [...chat.messages, requestMessage, getRecipeDetailMessage(recipe, chat)],
        };
      }),
    );
  }

  function openRecipeInNewChat(recipe: Recipe) {
    if (isGuest) { setAuthMode('login'); setView('auth'); return; }
    const chatId = createId('chat');
    const chat: Chat = {
      id: chatId,
      title: recipe.title,
      messages: [
        {
          id: createId('user'),
          role: 'user',
          text: `Хочу рецепт ${recipe.title}`,
        },
        getRecipeDetailMessage(recipe, { id: chatId, title: recipe.title, messages: [] }),
      ],
    };

    setChats((current) => [chat, ...current]);
    setActiveChatId(chatId);
    setView('chat');
    setSidebarOpen(false);
  }

  function openFavoriteRecipe(favorite: FavoriteRecipe) {
    setActiveChatId(favorite.chatId);
    setView('chat');
    setSidebarOpen(false);

    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== favorite.chatId) return chat;
        const context = { ...chatContext(chat), selectedRecipeId: favorite.recipe.id };
        if (chat.messages.some((message) => message.recipeDetail?.id === favorite.recipe.id)) return { ...chat, context };
        return {
          ...chat, context,
          messages: [...chat.messages, getRecipeDetailMessage(favorite.recipe, chat)],
        };
      }),
    );
  }

  function toggleFavorite(recipeId: string) {
    if (isGuest) {
      setAuthMode('register');
      setView('auth');
      return;
    }

    setFavorites((current) =>
      current.includes(recipeId) ? current.filter((id) => id !== recipeId) : [...current, recipeId],
    );
  }

  if (view === 'auth') {
    return (
      <main className="auth-page">
        <section className="auth-shell" aria-label="SweetMate авторизация">
          <div className="promo-panel">
            <div className="promo-panel__shade" />
            <div className="promo-panel__content">
              <Logo />
              <div>
                <p className="eyebrow">Больше, чем рецепты</p>
                <h1>Ваш личный помощник в мире десертов</h1>
                <p>
                  Задавайте вопросы, получайте персональные рекомендации и открывайте новые вкусы
                  каждый день.
                </p>
              </div>
              <blockquote>Пусть каждый день будет немного слаще</blockquote>
            </div>
          </div>

          <form className="auth-card" onSubmit={handleAuthSubmit}>
            <div className="tabs" role="tablist" aria-label="Способ входа">
              <button
                type="button"
                className={authMode === 'login' ? 'is-active' : ''}
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                }}
              >
                Вход
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'is-active' : ''}
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                }}
              >
                Регистрация
              </button>
            </div>

            <div className="auth-card__heading">
              <h2>{authMode === 'login' ? 'С возвращением!' : 'Добро пожаловать!'}</h2>
              <p>
                {authMode === 'login'
                  ? 'Продолжайте свое кулинарное путешествие вместе с нами.'
                  : 'Создайте аккаунт и перейдите к подбору рецептов.'}
              </p>
            </div>

            <label className="field">
              <span>Электронная почта</span>
              <input
                type="email"
                ref={emailInputRef}
                autoComplete="email"
                placeholder="example@mail.ru"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setDuplicateEmail(false); }}
              />
            </label>

            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <label className={`field ${authMode === 'login' ? 'field--reserved' : ''}`} aria-hidden={authMode === 'login'}>
              <span>Повторите пароль</span>
              <input
                type="password"
                placeholder="Подтвердите пароль"
                tabIndex={authMode === 'login' ? -1 : 0}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>

            <p role="alert" className={`form-error ${authError ? '' : 'is-hidden'}`}>{authError || 'Форма заполнена корректно.'}</p>

            {authMode === 'register' && duplicateEmail && <div className="auth-card__row">
              <button type="button" className="text-button" onClick={() => {
                setAuthMode('login'); setAuthError(''); setDuplicateEmail(false); setPassword(''); setConfirmPassword('');
              }}>Войти с этой почтой</button>
              <button type="button" className="text-button" onClick={() => {
                setEmail(''); setAuthError(''); setDuplicateEmail(false); emailInputRef.current?.focus();
              }}>Указать другую почту</button>
            </div>}

            <div className="auth-card__row">
              <button type="button" className="text-button" onClick={() => setView('chat')}>
                Вернуться к чату
              </button>

            </div>

            <button className="primary-button" type="submit" disabled={authPending}>
              {authPending ? 'Подождите…' : authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
            {demoEnabled && <div className="demo-entry">
              <p>Тестовые режимы — без регистрации</p>
              <button type="button" className="secondary-button" disabled={authPending} onClick={() => handleDemoLogin('user')}>Тестовый пользователь</button>
              <button type="button" className="secondary-button" disabled={authPending} onClick={() => handleDemoLogin('admin')}>Тестовый администратор</button>
            </div>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-page">
      <section className="app-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            aria-label="Открыть меню"
            onClick={() => setSidebarOpen((value) => !value)}
          >
            ☰
          </button>
          <Logo />
          <div className="topbar__actions">
            {isGuest ? (
              <button
                className="login-button"
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setView('auth');
                }}
              >
                Войти
              </button>
            ) : (
              <div className="user-menu">
                <button
                  className="user-menu__button"
                  type="button"
                  onClick={() => setUserMenuOpen((value) => !value)}
                >
                  <span className="avatar">{userInitial}</span>
                  <span>{displayName}</span>
                  <span aria-hidden="true">⌄</span>
                </button>
                {userMenuOpen && (
                  <div className="user-menu__popover">
                    {role === 'admin' && <button type="button" onClick={() => { setView('admin'); setUserMenuOpen(false); }}>Обзор администратора</button>}
                    <button
                      type="button"
                      onClick={() => {
                        setView('profile');
                        resetProfileForm();
                        setUserMenuOpen(false);
                      }}
                    >
                      Профиль
                    </button>
                    <button type="button" onClick={handleLogout}>
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="integration-notice">{requestError && <p className="integration-error" role="alert">{requestError}</p>}</div>
        <div className="workspace">
          <aside className={`sidebar ${view === 'admin' ? 'sidebar--admin' : ''} ${sidebarOpen ? 'is-open' : ''}`}>
            {view === 'admin' ? (
              <nav className="admin-nav" aria-label="Навигация окна администратора">
                <p className="admin-nav__label">Управление</p>
                <button
                  className="admin-nav__item is-active"
                  type="button"
                  onClick={() => {
                    document.getElementById('admin-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                    setSidebarOpen(false);
                  }}
                >
                  Обзор
                </button>
                <button className="admin-nav__item admin-nav__back" type="button" onClick={() => setView('chat')}>
                  Вернуться в чат
                </button>
              </nav>
            ) : (
              <>
            <button
              className="new-chat"
              type="button"
              onClick={handleNewChat}
              disabled={isGuest}
              title={isGuest ? 'Для нового чата нужно зарегистрироваться' : undefined}
            >
              <span>+</span>
              Новый чат
            </button>

            <nav className="sidebar-section" aria-label="Мои чаты">
              <h2>Мои чаты</h2>
              <div className="chat-list">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={chat.id === activeChat.id ? 'chat-list__row is-active' : 'chat-list__row'}
                  >
                    <button
                      type="button"
                      className="chat-list__item"
                      onClick={() => {
                        setActiveChatId(chat.id);
                        setView('chat');
                        setSidebarOpen(false);
                      }}
                    >
                      <span>{chat.title}</span>
                      <small>{chat.messages[chat.messages.length - 1]?.text.slice(0, 54)}</small>
                    </button>
                    {!isGuest && (
                      <button
                        type="button"
                        className="delete-chat"
                        aria-label={`Удалить чат ${chat.title}`}
                        onClick={() => handleDeleteChat(chat.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </nav>

            <section className="sidebar-section">
              <h2>Избранное</h2>
              {favoriteRecipes.length ? (
                <div className="favorite-list">
                  {favoriteRecipes.map((favorite) => (
                    <div className="favorite-entry" key={`${favorite.chatId}-${favorite.recipe.id}`}>
                      <button
                        className="favorite-card"
                        type="button"
                        onClick={() => openFavoriteRecipe(favorite)}
                      >
                        <RecipeImage src={favorite.recipe.image} alt="" />
                        <div>
                          <strong>{favorite.recipe.title}</strong>
                          <span>{favorite.recipe.time} · {favorite.recipe.tag}</span>
                        </div>
                      </button>
                      <button
                        className="favorite-remove"
                        type="button"
                        aria-label={`Удалить ${favorite.recipe.title} из избранного`}
                        title="Убрать из избранного"
                        onClick={() => toggleFavorite(favorite.recipe.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="sidebar-note">Отмечайте сердцем рецепты, чтобы вернуться к ним позже.</p>
              )}
            </section>

            <section className="sidebar-section">
              <h2>Популярные десерты</h2>
              {!sidebarPopular.length && <p className="sidebar-note">Пока нет статистики поиска.</p>}
              <div className="popular-list">
                {sidebarPopular.map((dessert) => (
                  <button
                    className="popular-card"
                    key={dessert.id}
                    type="button"
                    onClick={() => openRecipeInNewChat(dessert)}
                  >
                    <RecipeImage src={dessert.image} alt="" />
                    <div>
                      <strong>{dessert.title}</strong>
                      <span>{dessert.tag}</span>
                      <small>{dessert.requestCount.toLocaleString('ru-RU')} попаданий в выдачу</small>
                      <span className="popular-meter" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.round((dessert.requestCount / Math.max(1, sidebarPopular[0].requestCount)) * 100)}%`,
                          }}
                        />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
              </>
            )}
          </aside>

          {view === 'profile' ? (
            <section className="profile-panel" aria-label="Профиль пользователя">
              <div className="profile-card">
                <div className="profile-card__header">
                  <span className="profile-card__avatar">{userInitial}</span>
                  <div>
                    <p className="eyebrow">Профиль SweetMate</p>
                    <h1>{displayName}</h1>
                    <p>{userEmail}</p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Статус</dt>
                    <dd>{role === 'admin' ? 'Администратор' : 'Пользователь'}</dd>
                  </div>
                  <div>
                    <dt>Любимые рецепты</dt>
                    <dd>{favorites.length}</dd>
                  </div>
                </dl>

                <form className="profile-form profile-form--compact" onSubmit={handleNameChange}>
                  <h2>Имя в профиле</h2>
                  <label className="field">
                    <span>Отображаемое имя</span>
                    <input
                      type="text"
                      value={profileNameInput}
                      onChange={(event) => setProfileNameInput(event.target.value)}
                      placeholder="Например, Анастасия"
                      maxLength={32}
                    />
                  </label>
                  <button type="submit" className="secondary-button">
                    Сохранить имя
                  </button>
                </form>

                <form className="profile-form" onSubmit={handlePasswordChange}>
                  <h2>Смена пароля</h2>
                  <label className="field">
                    <span>Текущий пароль</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder="Введите текущий пароль"
                    />
                  </label>
                  <label className="field">
                    <span>Новый пароль</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Не менее 6 символов"
                    />
                  </label>
                  <label className="field">
                    <span>Повторите новый пароль</span>
                    <input
                      type="password"
                      value={repeatNewPassword}
                      onChange={(event) => setRepeatNewPassword(event.target.value)}
                      placeholder="Повторите пароль"
                    />
                  </label>
                  <button type="submit" className="secondary-button">
                    Сменить пароль
                  </button>
                </form>

                {profileMessage && <p className="profile-message" role="status">{profileMessage}</p>}

                <section className="danger-zone">
                  <div>
                    <h2>Удаление учетной записи</h2>
                    <p>Удалит серверный аккаунт и его сессии, а также чаты и избранное в этом браузере.</p>
                  </div>
                  <button type="button" className="danger-button" onClick={handleDeleteAccount}>
                    Удалить учетную запись
                  </button>
                </section>

                <div className="profile-actions">
                  <button type="button" className="secondary-button" onClick={() => setView('chat')}>
                    Вернуться к чату
                  </button>
                  <button type="button" className="primary-button" onClick={handleLogout}>
                    Выйти
                  </button>
                </div>
              </div>
            </section>
          ) : view === 'admin' ? (
            <AdminPanel demo={isDemo} />
          ) : (
            <section className="chat-panel" aria-label="Чат с Dessert AI">
              <div className="chat-header">
                <div>
                  <h1>Чат с Dessert AI</h1>
                  <p>Задавайте вопросы о десертах, получайте рекомендации и вдохновляйтесь новыми идеями.</p>
                </div>
                <span className="chat-status">{authLoading ? 'Проверяем вход…' : isGuest ? 'Просмотр' : isDemo ? 'Демо-режим' : 'Поиск по рецептам'}</span>
              </div>

              <div className="messages" aria-live="polite" ref={messagesRef}>
                {activeChat.messages.filter(message => message.role !== 'assistant' ||
                  Boolean(message.text.trim() || message.recipes?.length || message.recipeDetail || message.nutrition)).map((message) => (
                  <article className={`message message--${message.role}`} key={message.id}>
                    {message.role === 'assistant' && <span className="assistant-mark">S</span>}
                    <div className="message__bubble">
                      <p className="assistant-text">{message.text}</p>
                      {message.llmStatus && !['ok', 'not_needed'].includes(message.llmStatus) && (
                        <p className="generation-notice" role="status">
                          {message.llmStatus === 'not_configured' ? 'LLM не настроена. Показаны результаты поиска и доступные данные источника.' :
                            message.llmStatus === 'invalid_response' ? 'Ответ LLM не прошёл проверку. Показаны доступные данные источника.' :
                            'LLM временно недоступна. Найденные рецепты и данные источника остаются доступны.'}
                        </p>
                      )}
                      {message.nutrition && <NutritionTable data={message.nutrition} />}
                      {!isGuest && activeChat.messages.length === 1 && message.role === 'assistant' && (
                        <button type="button" className="text-button" onClick={() => setInput(exampleQuestion)}>Попробовать пример с бананом и молоком</button>
                      )}
                      {message.recipes && (
                        <div className="recipe-list">
                          {message.recipes.map((recipe) => (
                            <article className="recipe-card" key={recipe.id}>
                              <RecipeImage src={recipe.image} alt={recipe.title} />
                              <div className="recipe-card__content">
                                <div className="recipe-card__top">
                                  <h2>{recipe.title}</h2>
                                  <button
                                    type="button"
                                    className={`heart-button ${favorites.includes(recipe.id) ? 'is-active' : ''}`}
                                    aria-label={favorites.includes(recipe.id) ? 'Убрать из избранного' : 'Добавить в избранное'}
                                    onClick={() => toggleFavorite(recipe.id)}
                                  >
                                    {favorites.includes(recipe.id) ? '♥' : '♡'}
                                  </button>
                                </div>
                                <p className="recipe-summary">{recipe.description}</p>
                                {Boolean(recipe.matchedIngredients?.length) && <p className="ingredient-match">Из вашего запроса: {recipe.matchedIngredients!.join(', ')}</p>}
                                <ul className="card-ingredients" aria-label={'Ингредиенты: ' + recipe.title}>
                                  {recipe.ingredients.slice(0, 6).map((ingredient, index) => <li key={index}>{ingredient}</li>)}
                                </ul>
                                {recipe.ingredients.length > 6 && <small>Полный состав — в рецепте.</small>}
                                {Boolean(recipe.additionalIngredients?.length) && <p className="ingredient-extra">Дополнительно: {recipe.additionalIngredients!.slice(0, 6).join(', ')}{recipe.additionalIngredients!.length > 6 ? '…' : ''}</p>}
                                <div className="recipe-meta">
                                  <span>{recipe.time}</span>
                                  <span>{recipe.difficulty}</span>
                                  <span>{recipe.tag}</span>
                                  {recipe.servings != null && <span>Порций: {recipe.servings}</span>}
                                  {recipe.nutrition?.per100g?.kcal != null && <span>{recipe.nutrition.per100g.kcal.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ккал / 100 г</span>}
                                </div>
                                <button type="button" className="select-recipe" onClick={() => openRecipeInChat(recipe)}>
                                  Открыть полный рецепт
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                      {message.recipeDetail && <RecipeDetail recipe={message.recipeDetail} />}
                    </div>
                  </article>
                ))}
                {pending && <p className="search-status" role="status">Подбираем рецепты и готовим объяснение…</p>}
              </div>
              {isDemo && <p className="demo-notice" role="note">Демо-режим: тестовые данные отделены от личных аккаунтов и сбрасываются после перезапуска сервера.</p>}
              {isGuest ? (
                <div className="guest-composer">
                  <div>
                    <strong>Чтобы задать вопрос, нужно войти или зарегистрироваться.</strong>
                    <span>Пока доступен просмотр примера рекомендаций Dessert AI.</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setAuthMode('login');
                      setView('auth');
                    }}
                  >
                    Войти
                  </button>
                  <button
                    type="button"
                    className="send-button"
                    onClick={() => {
                      setAuthMode('register');
                      setView('auth');
                    }}
                  >
                    Зарегистрироваться
                  </button>
                  {demoEnabled && <div className="demo-entry demo-entry--guest">
                    <button type="button" className="secondary-button" disabled={authPending || authLoading} onClick={() => handleDemoLogin('user')}>Попробовать как пользователь</button>
                    <button type="button" className="secondary-button" disabled={authPending || authLoading} onClick={() => handleDemoLogin('admin')}>Посмотреть как администратор</button>
                  </div>}
                </div>
              ) : (
                <form className="composer" onSubmit={handleSend}>
                  <label className="sr-only" htmlFor="dessert-question">
                    Задайте вопрос о десертах
                  </label>
                  <input
                    id="dessert-question"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Задайте вопрос о десертах..."
                    maxLength={500}
                    aria-describedby="question-length"
                    aria-invalid={Boolean(requestError)}
                  />
                  <span id="question-length" className="question-length">{[...input].length}/500</span>
                  <button className="send-button" type="submit" aria-label="Отправить" disabled={pending || authLoading}>
                    Отправить
                  </button>
                </form>
              )}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
