## 🚀 Развертывание на Ubuntu 24 VPS

### **Вариант 1: С использованием Docker (РЕКОМЕНДУЕТСЯ)**

#### 1. Подключитесь к VPS и выполните начальную настройку:

```bash
# Подключение к VPS (замените на ваш IP)
ssh root@YOUR_VPS_IP

# Обновите систему
sudo apt update && sudo apt upgrade -y

sudo apt install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update

sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER

newgrp docker

# Проверьте установку
docker --version
docker compose version
```

#### 2. Клонируйте и настройте проект:

```bash
# Создайте директорию для проекта
mkdir -p /opt/servicebot
cd /opt/servicebot

# Клонируйте репозиторий (или загрузите файлы)
git clone YOUR_REPO_URL .

# Или если нет git-репозитория, скопируйте файлы через SCP:
# scp -r /path/to/local/project root@YOUR_VPS_IP:/opt/servicebot/
```

#### 3. Создайте файл `.env`:

```bash
# Откройте редактор
sudo nano /opt/servicebot/.env

# Вставьте (замените на ваши значения):
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
ADMIN_IDS=YOUR_ADMIN_IDS
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
PGHOST=YOUR_POSTGRES_HOST
PGDATABASE=YOUR_POSTGRES_DATABASE
PGUSER=YOUR_POSTGRES_USER
PGPASSWORD=YOUR_POSTGRES_PASSWORD
PGPORT=5432
```

Сохраните: `Ctrl+O` → `Enter` → `Ctrl+X`

#### 4. Запустите бота:

```bash
# Перейдите в директорию проекта
cd /opt/servicebot

# Запустите с помощью Docker Compose
sudo docker compose up -d --build

# Проверьте статус
sudo docker compose ps

# Посмотрите логи
sudo docker compose logs -f bot
```

---

### **Вариант 2: Без Docker (если Docker вам не нравится)**

#### 1. Установите зависимости:

```bash
# Установите Node.js 20+ (рекомендую через NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# Проверьте версию
node --version
npm --version
```

#### 2. Клонируйте и установите проект:

```bash
# Клонируйте репозиторий
cd /opt && git clone YOUR_REPO_URL servicebot
cd servicebot

# Установите зависимости
npm ci

# Соберите проект
npm run build
```

#### 3. Создайте файл `.env` и запустите:

```bash
# Создайте .env файл
sudo nano .env
# (вставьте данные как выше)

# Запустите бота
npm start

# Или используйте pm2 для фонового запуска:
sudo npm install -g pm2
pm2 start dist/bot.js --name "servicebot"
pm2 startup
pm2 save
```

---

### **🔒 Дополнительная безопасность и управление**

#### Если используете Docker, создайте `systemd` сервис:

```bash
# Создайте файл сервиса
sudo nano /etc/systemd/system/servicebot.service
```

Вставьте:

```ini
[Unit]
Description=Service Bot Docker Container
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/opt/servicebot
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=unless-stopped
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Затем:

```bash
# Активируйте сервис
sudo systemctl daemon-reload
sudo systemctl enable servicebot
sudo systemctl start servicebot

# Проверьте статус
sudo systemctl status servicebot

# Посмотрите логи
sudo journalctl -u servicebot -f
```

---

### **📋 Чек-лист перед запуском**

- ✅ VPS имеет минимум 1GB RAM и 5GB диска
- ✅ Переменные окружения в `.env` корректны
- ✅ Supabase таблицы `repairs`, `orders`, `notification_chats` созданы
- ✅ Telegram бот токен активен
- ✅ Если нужна база данных, она доступна из VPS
- ✅ Порты открыты в файрволе (если нужно для внешних подключений)

---

### **🆘 Полезные команды для управления**

```bash
# Перезагрузите бота
sudo docker compose restart bot
# или
sudo systemctl restart servicebot

# Посмотрите логи
sudo docker compose logs -f --tail 50
# или
sudo journalctl -u servicebot -f --lines=50

# Остановите бота
sudo docker compose down
# или
sudo systemctl stop servicebot

# Обновите код (если используете git)
cd /opt/servicebot
git pull
sudo docker compose up -d --build
```
