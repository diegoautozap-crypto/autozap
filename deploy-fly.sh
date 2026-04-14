#!/bin/bash
# AutoZap - Deploy para Fly.io (São Paulo - GRU)
# Rodar: bash deploy-fly.sh

FLY="C:/Users/Adm/.fly/bin/flyctl"

echo "=== AutoZap → Fly.io (São Paulo) ==="
echo ""

# 1. Criar apps
echo "--- Criando apps ---"
for app in autozap-auth autozap-tenant autozap-channel autozap-message autozap-contact autozap-conversation autozap-campaign autozap-frontend; do
  $FLY apps create $app --org personal 2>/dev/null || echo "$app já existe"
done

# 2. Criar Redis via Upstash
echo ""
echo "--- Redis ---"
echo "Crie o Redis manualmente em: https://fly.io/dashboard → Upstash Redis"
echo "Ou use: fly redis create autozap-redis --region gru"
echo ""

# 3. Configurar secrets (você precisa preencher)
echo "--- Configurando secrets ---"
echo "Cole suas variáveis de ambiente abaixo (uma por vez):"
echo ""
echo "Exemplo:"
echo '$FLY secrets set SUPABASE_URL="https://xxx.supabase.co" --app autozap-auth'
echo ""

# 4. Deploy de cada serviço
echo "--- Deploy dos serviços ---"
echo "Rodar cada um separadamente (do diretório raiz do projeto):"
echo ""
echo "cd C:/Users/Adm/Desktop/autozap"
echo ""
echo "$FLY deploy . --config apps/auth-service/fly.toml --dockerfile apps/auth-service/Dockerfile --region gru"
echo "$FLY deploy . --config apps/tenant-service/fly.toml --dockerfile apps/tenant-service/Dockerfile --region gru"
echo "$FLY deploy . --config apps/channel-service/fly.toml --dockerfile apps/channel-service/Dockerfile --region gru"
echo "$FLY deploy . --config apps/message-service/fly.toml --dockerfile apps/message-service/Dockerfile --region gru"
echo "$FLY deploy . --config apps/contact-service/fly.toml --dockerfile apps/contact-service/Dockerfile --region gru"
echo "$FLY deploy . --config apps/conversation-service/fly.toml --dockerfile apps/conversation-service/Dockerfile --region gru"
echo "$FLY deploy . --config apps/campaign-service/fly.toml --dockerfile apps/campaign-service/Dockerfile --region gru"
echo "$FLY deploy . --config apps/frontend/fly.toml --dockerfile apps/frontend/Dockerfile --region gru"
