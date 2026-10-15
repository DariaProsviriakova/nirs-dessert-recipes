import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

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
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  recipes?: Recipe[];
  recipeDetail?: Recipe;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
};

type AuthMode = 'login' | 'register';
type View = 'chat' | 'auth' | 'profile';

const storageKeys = {
  chats: 'sweetmate:chats',
  favorites: 'sweetmate:favorites',
  requestCounts: 'sweetmate:requestCounts',
  password: 'sweetmate:password',
  profileName: 'sweetmate:profileName',
  user: 'sweetmate:user',
  email: 'sweetmate:email',
};

const exampleQuestion =
  'У меня есть бананы, овсяные хлопья и немного тёмного шоколада. Что можно приготовить на десерт?';

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

function normalizeRecipeText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getRecipeScore(recipe: Recipe, question: string) {
  const normalizedQuestion = normalizeRecipeText(question);
  const words = normalizedQuestion.split(/[^a-zа-я0-9]+/i).filter(Boolean);
  const title = normalizeRecipeText(recipe.title);
  const aliases = recipe.aliases.map(normalizeRecipeText);
  const searchable = normalizeRecipeText(
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

function findExactRecipe(question: string) {
  const normalizedQuestion = normalizeRecipeText(question);

  return recipeLibrary.find((recipe) => normalizedQuestion.includes(normalizeRecipeText(recipe.title)));
}

function selectRecipesForQuestion(question: string) {
  return recipeLibrary
    .map((recipe) => ({ recipe, score: getRecipeScore(recipe, question) }))
    .sort((a, b) => b.score - a.score || b.recipe.requestCount - a.recipe.requestCount)
    .slice(0, 3)
    .map(({ recipe }) => ({ ...recipe }));
}

function getResponseForQuestion(question: string) {
  const exactRecipe = findExactRecipe(question);

  if (exactRecipe) {
    return {
      text: `Конечно, вот полный рецепт: ${exactRecipe.title}.`,
      recipeDetail: { ...exactRecipe },
    };
  }

  return {
    text:
      'Я подобрала 3 варианта из библиотеки рецептов. Выберите карточку, и я открою полный рецепт следующим сообщением в чате.',
    recipes: selectRecipesForQuestion(question),
  };
}

const mockResponses: Message[] = [
  {
    id: 'response-bananas',
    role: 'assistant',
    ...getResponseForQuestion(exampleQuestion),
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
      text: exampleQuestion,
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
  return ownerEmail ? readStorage(getScopedStorageKey(storageKeys.chats, ownerEmail), getGuestChats()) : getGuestChats();
}

function getStoredFavorites(ownerEmail: string) {
  return ownerEmail ? readStorage<string[]>(getScopedStorageKey(storageKeys.favorites, ownerEmail), []) : [];
}

function getFallbackDisplayName(ownerEmail: string) {
  const normalizedEmail = normalizeEmail(ownerEmail);
  const fallbackName = normalizedEmail.split('@')[0] || 'Анастасия';

  return fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1);
}

function getStoredDisplayName(ownerEmail: string) {
  if (!ownerEmail) {
    return '';
  }

  const scopedName = localStorage.getItem(getScopedStorageKey(storageKeys.profileName, ownerEmail));

  return scopedName || getFallbackDisplayName(ownerEmail);
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeChatTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 38 ? `${clean.slice(0, 38)}...` : clean || 'Новый чат';
}

function cloneResponse(question: string, _messageCount: number, requestCounts: Record<string, number>): Message {
  const response = getResponseForQuestion(question);
  const withRequestCount = (recipe: Recipe) => ({
    ...recipe,
    requestCount: requestCounts[recipe.id] ?? recipe.requestCount,
  });

  return {
    id: createId('assistant'),
    role: 'assistant',
    text: response.text,
    recipes: response.recipes?.map(withRequestCount),
    recipeDetail: response.recipeDetail ? withRequestCount(response.recipeDetail) : undefined,
  };
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
          'Расскажите, какие продукты есть под рукой или какое настроение у десерта. Я предложу несколько подходящих идей.',
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

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  return (
    <section className="recipe-detail" aria-label={`Полный рецепт: ${recipe.title}`}>
      <div className="recipe-detail__header">
        <div>
          <p className="eyebrow">Полный рецепт</p>
          <h3>{recipe.title}</h3>
        </div>
        <span>{recipe.requestCount.toLocaleString('ru-RU')} запросов</span>
      </div>
      <p>{recipe.description}</p>
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
  const [user, setUser] = useState<string>(() => {
    const storedEmail = localStorage.getItem(storageKeys.email) || '';
    return localStorage.getItem(storageKeys.user) || getStoredDisplayName(storedEmail);
  });
  const [userEmail, setUserEmail] = useState<string>(() => localStorage.getItem(storageKeys.email) || '');
  const [view, setView] = useState<View>('chat');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [chats, setChats] = useState<Chat[]>(() => getStoredChats(localStorage.getItem(storageKeys.email) || ''));
  const [activeChatId, setActiveChatId] = useState(
    () => getStoredChats(localStorage.getItem(storageKeys.email) || '')[0]?.id ?? initialChat.id,
  );
  const [input, setInput] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() =>
    getStoredFavorites(localStorage.getItem(storageKeys.email) || ''),
  );
  const [requestCounts, setRequestCounts] = useState<Record<string, number>>(() => {
    const savedCounts = readStorage<Record<string, number> | null>(storageKeys.requestCounts, null);

    return Object.fromEntries(
      recipeLibrary.map((recipe) => [
        recipe.id,
        savedCounts && Number.isFinite(savedCounts[recipe.id]) ? savedCounts[recipe.id] : recipe.requestCount,
      ]),
    );
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatNewPassword, setRepeatNewPassword] = useState('');
  const [profileNameInput, setProfileNameInput] = useState(() => {
    const storedEmail = localStorage.getItem(storageKeys.email) || '';
    return localStorage.getItem(storageKeys.user) || getStoredDisplayName(storedEmail);
  });
  const [profileMessage, setProfileMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0] ?? initialChat;
  const isGuest = !user;
  const displayName = user || 'Гость';
  const userInitial = user ? user.slice(0, 1).toUpperCase() : '?';
  const popularDesserts = useMemo(
    () =>
      recipeLibrary
        .map((recipe) => ({ ...recipe, requestCount: requestCounts[recipe.id] ?? recipe.requestCount }))
        .sort((a, b) => b.requestCount - a.requestCount)
        .slice(0, 4),
    [requestCounts],
  );

  useEffect(() => {
    localStorage.setItem(storageKeys.requestCounts, JSON.stringify(requestCounts));
  }, [requestCounts]);

  useEffect(() => {
    const messages = messagesRef.current;

    if (view === 'chat' && messages) {
      messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
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
    if (userEmail) {
      localStorage.setItem(getScopedStorageKey(storageKeys.chats, userEmail), JSON.stringify(chats));
    }
  }, [chats, userEmail]);

  useEffect(() => {
    if (userEmail) {
      localStorage.setItem(getScopedStorageKey(storageKeys.favorites, userEmail), JSON.stringify(favorites));
    }
  }, [favorites, userEmail]);

  function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    setAuthError('');

    if (!email.trim() || !password.trim()) {
      setAuthError('Заполните электронную почту и пароль.');
      return;
    }

    if (authMode === 'register' && password !== confirmPassword) {
      setAuthError('Пароли не совпадают.');
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const passwordKey = getScopedStorageKey(storageKeys.password, normalizedEmail);
    const savedPassword = localStorage.getItem(passwordKey);

    if (authMode === 'login' && savedPassword && savedPassword !== password) {
      setAuthError('Неверный пароль. Проверьте данные и попробуйте снова.');
      return;
    }

    if (authMode === 'register' && savedPassword) {
      setAuthError('Аккаунт с такой почтой уже существует. Войдите или укажите другую почту.');
      return;
    }

    const userChats = getStoredChats(normalizedEmail);
    const userFavorites = getStoredFavorites(normalizedEmail);
    const displayName = getStoredDisplayName(normalizedEmail);
    localStorage.setItem(storageKeys.user, displayName);
    localStorage.setItem(storageKeys.email, normalizedEmail);

    if (authMode === 'register' || !savedPassword) {
      localStorage.setItem(passwordKey, password);
    }

    if (!localStorage.getItem(getScopedStorageKey(storageKeys.profileName, normalizedEmail))) {
      localStorage.setItem(getScopedStorageKey(storageKeys.profileName, normalizedEmail), displayName);
    }

    setUser(displayName);
    setUserEmail(normalizedEmail);
    setProfileNameInput(displayName);
    setChats(userChats);
    setActiveChatId(userChats[0]?.id ?? initialChat.id);
    setFavorites(userFavorites);
    setPassword('');
    setConfirmPassword('');
    setView('chat');
  }

  function handleLogout() {
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.email);
    setUser('');
    setUserEmail('');
    setChats(getGuestChats());
    setActiveChatId(initialChat.id);
    setFavorites([]);
    setInput('');
    setProfileNameInput('');
    setUserMenuOpen(false);
    setView('chat');
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

  function handleNameChange(event: FormEvent) {
    event.preventDefault();

    const nextName = profileNameInput.trim().replace(/\s+/g, ' ');

    if (!userEmail || !nextName) {
      setProfileMessage('Введите имя, которое будет отображаться в профиле.');
      return;
    }

    localStorage.setItem(storageKeys.user, nextName);
    localStorage.setItem(getScopedStorageKey(storageKeys.profileName, userEmail), nextName);
    setUser(nextName);
    setProfileNameInput(nextName);
    setProfileMessage('Имя профиля обновлено.');
  }

  function handlePasswordChange(event: FormEvent) {
    event.preventDefault();

    if (!userEmail) {
      return;
    }

    const passwordKey = getScopedStorageKey(storageKeys.password, userEmail);
    const savedPassword = localStorage.getItem(passwordKey);

    if (savedPassword && currentPassword !== savedPassword) {
      setProfileMessage('Текущий пароль введен неверно.');
      return;
    }

    if (newPassword.length < 6) {
      setProfileMessage('Новый пароль должен быть не короче 6 символов.');
      return;
    }

    if (newPassword !== repeatNewPassword) {
      setProfileMessage('Новый пароль и подтверждение не совпадают.');
      return;
    }

    localStorage.setItem(passwordKey, newPassword);
    resetProfileForm('Пароль обновлен.');
  }

  function handleDeleteAccount() {
    if (!userEmail) {
      return;
    }

    const shouldDelete = window.confirm('Удалить учетную запись SweetMate и все демо-данные этого пользователя?');

    if (!shouldDelete) {
      return;
    }

    localStorage.removeItem(getScopedStorageKey(storageKeys.chats, userEmail));
    localStorage.removeItem(getScopedStorageKey(storageKeys.favorites, userEmail));
    localStorage.removeItem(getScopedStorageKey(storageKeys.password, userEmail));
    localStorage.removeItem(getScopedStorageKey(storageKeys.profileName, userEmail));
    handleLogout();
  }

  function submitQuestion(rawQuestion: string, allowGuestPreview = false) {
    const question = rawQuestion.trim();

    if (!question || (isGuest && !allowGuestPreview)) {
      return;
    }

    const requestedRecipe = findExactRecipe(question);
    const nextRequestCounts = requestedRecipe
      ? {
          ...requestCounts,
          [requestedRecipe.id]: (requestCounts[requestedRecipe.id] ?? requestedRecipe.requestCount) + 1,
        }
      : requestCounts;

    if (requestedRecipe) {
      setRequestCounts(nextRequestCounts);
    }

    const userMessage: Message = {
      id: createId('user'),
      role: 'user',
      text: question,
    };

    setChats((current) =>
      current.map((chat) => {
        if (chat.id !== activeChat.id) {
          return chat;
        }

        const answer = cloneResponse(question, chat.messages.length, nextRequestCounts);
        const nextMessages = [...chat.messages, userMessage, answer];
        const shouldRename = chat.title === 'Новый чат';

        return {
          ...chat,
          title: shouldRename ? makeChatTitle(question) : chat.title,
          messages: nextMessages,
        };
      }),
    );
    setInput('');
    setView('chat');
    setSidebarOpen(false);
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    submitQuestion(input);
  }

  function getRecipeDetailMessage(recipe: Recipe): Message {
    return {
      id: createId('assistant'),
      role: 'assistant',
      text: `Вот полный рецепт: ${recipe.title}.`,
      recipeDetail: { ...recipe },
    };
  }

  function openRecipeInChat(recipe: Recipe) {
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
          messages: [...chat.messages, requestMessage, getRecipeDetailMessage(recipe)],
        };
      }),
    );
  }

  function openRecipeInNewChat(recipe: Recipe) {
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
        getRecipeDetailMessage(recipe),
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
        if (chat.id !== favorite.chatId || chat.messages.some((message) => message.recipeDetail?.id === favorite.recipe.id)) {
          return chat;
        }

        return {
          ...chat,
          messages: [...chat.messages, getRecipeDetailMessage(favorite.recipe)],
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
                  : 'Создайте демо-аккаунт и перейдите к чату с Dessert AI.'}
              </p>
            </div>

            <label className="field">
              <span>Электронная почта</span>
              <input
                type="email"
                placeholder="example@mail.ru"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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

            <p className={`form-error ${authError ? '' : 'is-hidden'}`}>{authError || 'Форма заполнена корректно.'}</p>

            <div className="auth-card__row">
              <button type="button" className="text-button" onClick={() => setView('chat')}>
                Вернуться к чату
              </button>
              <button type="button" className="text-button">
                Забыли пароль?
              </button>
            </div>

            <button className="primary-button" type="submit">
              {authMode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
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

        <div className="workspace">
          <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
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
                        <img src={favorite.recipe.image} alt="" />
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
              <div className="popular-list">
                {popularDesserts.map((dessert) => (
                  <button
                    className="popular-card"
                    key={dessert.id}
                    type="button"
                    onClick={() => openRecipeInNewChat(dessert)}
                  >
                    <img src={dessert.image} alt="" />
                    <div>
                      <strong>{dessert.title}</strong>
                      <span>{dessert.tag}</span>
                      <small>{dessert.requestCount.toLocaleString('ru-RU')} запросов</small>
                      <span className="popular-meter" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.round((dessert.requestCount / popularDesserts[0].requestCount) * 100)}%`,
                          }}
                        />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          {view === 'profile' ? (
            <section className="profile-panel" aria-label="Профиль пользователя">
              <div className="profile-card">
                <div className="profile-card__header">
                  <span className="profile-card__avatar">{userInitial}</span>
                  <div>
                    <p className="eyebrow">Профиль SweetMate</p>
                    <h1>{displayName}</h1>
                    <p>{userEmail || 'Демо-пользователь SweetMate'}</p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Статус</dt>
                    <dd>Демо-аккаунт</dd>
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

                {profileMessage && <p className="profile-message">{profileMessage}</p>}

                <section className="danger-zone">
                  <div>
                    <h2>Удаление учетной записи</h2>
                    <p>Удалит демо-чаты, избранное и сохраненный пароль текущего пользователя на этом устройстве.</p>
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
          ) : (
            <section className="chat-panel" aria-label="Чат с Dessert AI">
              <div className="chat-header">
                <div>
                  <h1>Чат с Dessert AI</h1>
                  <p>Задавайте вопросы о десертах, получайте рекомендации и вдохновляйтесь новыми идеями.</p>
                </div>
                <span className="chat-status">{isGuest ? 'Просмотр' : 'Демо-режим'}</span>
              </div>

              <div className="messages" aria-live="polite" ref={messagesRef}>
                {activeChat.messages.map((message) => (
                  <article className={`message message--${message.role}`} key={message.id}>
                    {message.role === 'assistant' && <span className="assistant-mark">S</span>}
                    <div className="message__bubble">
                      <p>{message.text}</p>
                      {message.recipes && (
                        <div className="recipe-list">
                          {message.recipes.map((recipe) => (
                            <article className="recipe-card" key={recipe.id}>
                              <img src={recipe.image} alt={recipe.title} />
                              <div className="recipe-card__content">
                                <div className="recipe-card__top">
                                  <h2>{recipe.title}</h2>
                                  <button
                                    type="button"
                                    className={`heart-button ${favorites.includes(recipe.id) ? 'is-active' : ''}`}
                                    aria-label="Добавить в избранное"
                                    onClick={() => toggleFavorite(recipe.id)}
                                  >
                                    {favorites.includes(recipe.id) ? '♥' : '♡'}
                                  </button>
                                </div>
                                <p>{recipe.description}</p>
                                <div className="recipe-meta">
                                  <span>{recipe.time}</span>
                                  <span>{recipe.difficulty}</span>
                                  <span>{recipe.tag}</span>
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
              </div>

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
                  />
                  <button className="send-button" type="submit" aria-label="Отправить">
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
