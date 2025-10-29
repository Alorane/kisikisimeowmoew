# kisikisimeowmoew Service Bot

This is a Telegram bot for a repair service, refactored to use TypeScript and Supabase.

## Setup

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Environment Variables:**

    Create a `.env` file in the root of the project with the following variables:

    ```env
    BOT_TOKEN=your_telegram_bot_token_here
    ADMIN_IDS=your_telegram_user_id_here # Can be a comma-separated list of IDs
    SUPABASE_URL=your_supabase_project_url_here
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
    ```

3.  **Supabase Database:**

    You need to set up two tables in your Supabase project: `repairs` and `orders`.

    **`repairs` table schema:**

    - `id` (bigint, primary key, generated)
    - `device` (text)
    - `title` (text)
    - `price` (numeric)
    - `desc` (text)

    **`orders` table schema:**

    - `id` (bigint, primary key, generated)
    - `ts` (timestamp with time zone)
    - `name` (text)
    - `phone` (text)
    - `model` (text)
    - `issue` (text)
    - `price` (numeric)

    **`notification_chats` table schema:**

    - `chat_id` (text, primary key)

4.  **Build the project:**
    ```bash
    npm run build
    ```

## Usage

- **Start the bot:**
  ```bash
  npm start
  ```
- **Run in development mode:**
  ```bash
  npm run dev
  ```
