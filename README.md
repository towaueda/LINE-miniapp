This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


招待コード
Triangle_admin


 ---                                                                                                                                                    
  LINE ミニアプリ 開発→本番移行手順                                                                                                                      
                                                                                                                                                         
  ステップ1: LINE Developers Console での作業                                                                                                            
                                                                                                                                                         
  1. LINE Developersコンソール (https://developers.line.biz/) にログイン                                                                                 
  2. 本番用のLINEログインチャネルを作成（または既存の開発用を本番に切り替え）                                                                            
  3. LIFFアプリの設定を変更：                                                                                                                            
    - エンドポイントURLを本番ドメイン（例: https://your-app.vercel.app）に変更
    - Scopeの確認（profile, openid など）                                                                                                                
    - 「公開」ステータスに変更                                                                                                                           
  4. 本番用のLIFF IDを控える（現在の開発用: 2009131855-MOcBwE4k）                                                                                        
                                                                                                                                                         
  ---
  ステップ2: Supabase の本番環境準備

  現在の開発用Supabase（gzoylicntzrxewdcbjeq.supabase.co）を本番でも使う場合はそのまま。分ける場合は：

  1. Supabaseで本番用プロジェクトを作成
  2. マイグレーションを適用（テーブル・RPC・RLSポリシー）
  3. 本番用のURL, Anon Key, Service Role Keyを控える

  ---
  ステップ3: Vercel へのデプロイ

  1. Vercelにプロジェクトをインポート（GitHubリポジトリ連携）
  2. Vercelの環境変数を設定（Settings → Environment Variables）：

  ┌───────────────────────────────┬───────────────────────────────────┬─────────────────────────────┐
  │            変数名             │                値                 │            備考             │
  ├───────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ NEXT_PUBLIC_LIFF_ID           │ 本番用LIFF ID                     │ LINE Developers Consoleから │
  ├───────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ NEXT_PUBLIC_SUPABASE_URL      │ 本番用Supabase URL                │ Supabaseダッシュボードから  │
  ├───────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ NEXT_PUBLIC_SUPABASE_ANON_KEY │ 本番用Anon Key                    │ 同上                        │
  ├───────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ SUPABASE_SERVICE_ROLE_KEY     │ 本番用Service Role Key            │ 同上（秘密鍵）              │
  ├───────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ ADMIN_PASSWORD                │ 強力なパスワード                  │ 現在空なので必ず設定        │
  ├───────────────────────────────┼───────────────────────────────────┼─────────────────────────────┤
  │ INVITE_CODE_HASH              │ 本番用招待コードのSHA-256ハッシュ │ 変更不要ならそのまま        │
  └───────────────────────────────┴───────────────────────────────────┴─────────────────────────────┘

  3. デプロイ実行（git push またはVercelダッシュボードから）

  ---
  ステップ4: LINE Developers Console のエンドポイント更新

  1. LIFFアプリのエンドポイントURLをVercelの本番URL に更新
  2. LINEミニアプリのチャネルで：
    - サービスURLを本番URLに変更
    - チャネルのステータスを**「公開」**に変更

  ---
  ステップ5: 動作確認

  - LINEアプリからミニアプリを開けるか
  - 招待コード入力→ログインが正常に動作するか
  - マッチング機能がDBを参照して動作するか
  - チャットのリアルタイム送受信が動作するか
  - 管理画面にログインできるか（ADMIN_PASSWORDの確認）

  ---
  注意点

  - ADMIN_PASSWORDが現在空（src/app/api/admin/auth/route.ts:4）なので、本番では必ず設定してください
  - コード上はすべて環境変数で切り替わる設計なので、コードの変更は不要です
  - NODE_ENVはVercelが自動でproductionに設定するため、cookieのsecureフラグなども自動で有効になります


 ---                                                                                                                                                    
  LINE Developers Console 本番設定手順                                                                                                                   
                                                                                                                                                         
  1. コンソールにアクセス                                                                                                                                
                                                                                                                                                       
  1. https://developers.line.biz/console/ にアクセス
  2. LINEアカウントでログイン
  3. 現在使っているプロバイダーを選択

  ---
  2. チャネルのステータスを確認

  現在の開発用チャネル（LIFF ID: 2009131855-MOcBwE4k）を開き、以下を確認：

  チャネルの種類は2パターンあります：

  パターンA: 既存の開発用チャネルをそのまま本番にする場合

  1. LINEログインチャネルを開く
  2. 「チャネル基本設定」タブ：
    - チャネル名: 本番用の名前に変更（ユーザーに見える）
    - チャネル説明: 本番用の説明に更新
    - チャネルアイコン: 本番用に設定
    - プライバシーポリシーURL: 本番URLを設定（審査に必要）
    - サービス利用規約URL: 本番URLを設定（審査に必要）
  3. 「公開」タブ or ステータス：
    - **「開発中」→「公開済み」**に変更
    - これにより、自分以外のユーザーもLIFFアプリにアクセスできるようになる

  ---
  3. LIFFアプリの設定

  チャネル内の「LIFF」タブを開く：

  1. 既存のLIFFアプリを編集（または新規追加）
  2. 以下を設定：

  ┌───────────────────┬─────────────────────────────┬──────────────────────────────────────────────────────┐
  │     設定項目      │             値              │                         説明                         │
  ├───────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ LIFFアプリ名      │ 任意の名前                  │ 管理用                                               │
  ├───────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ サイズ            │ Full                        │ 全画面表示（このアプリに適切）                       │
  ├───────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ エンドポイントURL │ https://your-app.vercel.app │ Vercelの本番ドメイン（https必須）                    │
  ├───────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ Scope             │ profile にチェック          │ コードでliff.getProfile()を使用しているため必須      │
  ├───────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ ボットリンク機能  │ 必要に応じて設定            │ LINE公式アカウントとの連携が必要なら On (aggressive) │
  ├───────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ Scan QR           │ OFF                         │ 使用していない                                       │
  ├───────────────────┼─────────────────────────────┼──────────────────────────────────────────────────────┤
  │ モジュールモード  │ OFF                         │ 使用していない                                       │
  └───────────────────┴─────────────────────────────┴──────────────────────────────────────────────────────┘

  3. 設定を保存するとLIFF IDが表示される（形式: 数字-英数字）
  4. このLIFF IDをコピーして、Vercelの環境変数 NEXT_PUBLIC_LIFF_ID に設定

  ---
  4. LINEミニアプリとして公開する場合（任意）

  LIFFアプリだけでなく、LINE内の「サービス」タブに表示させたい場合は追加の手順が必要です：

  1. LINE Developers Consoleで「LINEミニアプリ」チャネルを作成
  2. サービスURLにLIFFのURLを設定: https://liff.line.me/{LIFF_ID}
  3. アイコン、名前、説明を設定
  4. 審査を申請（LINEによる審査が必要、通常数営業日）

  ---
  5. 重要な確認事項

  ┌──────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────┐
  │         確認項目         │                                               詳細                                               │
  ├──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ エンドポイントURLはHTTPS │ Vercelは自動でHTTPS。http://は不可                                                               │
  ├──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ チャネルが「公開済み」   │ 「開発中」のままだと自分のLINEアカウントでしかアクセスできない                                   │
  ├──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ コールバックURL（任意）  │ LINEログインチャネルの「LINEログイン設定」タブで、外部ブラウザからのログインを許可する場合は設定 │
  ├──────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Scopeでprofileにチェック │ liff.getProfile()が動作するために必須                                                            │
  └──────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  手順まとめ（最短ルート）

  1. LINE Developers Console → チャネルを開く
  2. LIFF タブ → エンドポイントURLを本番URLに変更
  3. LIFF ID をコピー
  4. Vercel の環境変数に NEXT_PUBLIC_LIFF_ID として設定
  5. チャネルのステータスを「公開済み」に変更
  6. デプロイ後、LINEアプリからアクセスして動作確認