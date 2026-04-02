'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { messageApi, channelApi } from '@/lib/api'
import { toast } from 'sonner'
import { Workflow, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, ChevronRight, X, Check, Clock, FileText, Copy } from 'lucide-react'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/i18n'
import { usePermissions } from '@/store/permissions.store'

function getFlowTemplates(t: (key: string) => string) {
  return [
    {
      id: 'welcome',
      emoji: '👋',
      name: t('flows.templateWelcome'),
      desc: t('flows.templateWelcomeDesc'),
      category: t('flows.categorySimple'),
      categoryKey: 'simple',
      nodes: [
        { id: 'n1', type: 'trigger_first_message', position_x: 100, position_y: 200, data: { type: 'trigger_first_message', keywords: [] } },
        { id: 'n2', type: 'send_message', position_x: 400, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! 👋 Seja bem-vindo(a)! Como posso te ajudar hoje?' } },
      ],
      edges: [{ id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' }],
    },
    {
      id: 'outside_hours',
      emoji: '🕐',
      name: t('flows.templateOutsideHours'),
      desc: t('flows.templateOutsideHoursDesc'),
      category: t('flows.categorySimple'),
      categoryKey: 'simple',
      nodes: [
        { id: 'n1', type: 'trigger_outside_hours', position_x: 100, position_y: 200, data: { type: 'trigger_outside_hours', start: 9, end: 18 } },
        { id: 'n2', type: 'send_message', position_x: 400, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. Deixe sua mensagem que responderemos assim que possível! 😊' } },
        { id: 'n3', type: 'end', position_x: 700, position_y: 200, data: { type: 'end' } },
      ],
      edges: [
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
      ],
    },
    {
      id: 'lead_qualify',
      emoji: '🎯',
      name: t('flows.templateLeadQualify'),
      desc: t('flows.templateLeadQualifyDesc'),
      category: t('flows.categoryIntermediate'),
      categoryKey: 'intermediate',
      nodes: [
        { id: 'n1', type: 'trigger_keyword', position_x: 50, position_y: 200, data: { type: 'trigger_keyword', keywords: ['oi', 'olá', 'info', 'quero'], matchType: 'contains' } },
        { id: 'n2', type: 'send_message', position_x: 320, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! 😊 Para te atender melhor, qual é o seu nome?' } },
        { id: 'n3', type: 'input', position_x: 600, position_y: 200, data: { type: 'input', question: '', saveAs: 'nome' } },
        { id: 'n4', type: 'send_message', position_x: 880, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Prazer, {{nome}}! O que te interessa?\n\n1️⃣ Conhecer o produto\n2️⃣ Saber preços\n3️⃣ Suporte' } },
        { id: 'n5', type: 'input', position_x: 1160, position_y: 200, data: { type: 'input', question: '', saveAs: 'interesse' } },
        { id: 'n6', type: 'tag_contact', position_x: 1440, position_y: 100, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n7', type: 'move_pipeline', position_x: 1440, position_y: 300, data: { type: 'move_pipeline', stage: 'qualificacao' } },
        { id: 'n8', type: 'assign_agent', position_x: 1720, position_y: 200, data: { type: 'assign_agent', message: 'Obrigado, {{nome}}! Um atendente já vai te ajudar. 🚀' } },
      ],
      edges: [
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
        { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'success' },
        { id: 'e5', source_node: 'n5', target_node: 'n6', source_handle: 'success' },
        { id: 'e6', source_node: 'n5', target_node: 'n7', source_handle: 'success' },
        { id: 'e7', source_node: 'n7', target_node: 'n8', source_handle: 'success' },
      ],
    },
    {
      id: 'satisfaction',
      emoji: '⭐',
      name: t('flows.templateSatisfaction'),
      desc: t('flows.templateSatisfactionDesc'),
      category: t('flows.categoryIntermediate'),
      categoryKey: 'intermediate',
      nodes: [
        { id: 'n1', type: 'trigger_keyword', position_x: 50, position_y: 200, data: { type: 'trigger_keyword', keywords: ['pesquisa', 'avaliar', 'feedback'], matchType: 'contains' } },
        { id: 'n2', type: 'send_message', position_x: 320, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! Gostaríamos de saber sua opinião. De 1 a 5, como avalia nosso atendimento?' } },
        { id: 'n3', type: 'input', position_x: 600, position_y: 200, data: { type: 'input', question: '', saveAs: 'nota' } },
        { id: 'n4', type: 'condition', position_x: 880, position_y: 200, data: { type: 'condition', branches: [{ id: 'b1', label: 'Nota alta (4-5)', logic: 'OR', rules: [{ id: 'r1', field: 'variable', fieldName: 'nota', operator: 'contains', value: '4, 5' }] }, { id: 'b2', label: 'Nota baixa (1-3)', logic: 'OR', rules: [{ id: 'r2', field: 'variable', fieldName: 'nota', operator: 'contains', value: '1, 2, 3' }] }] } },
        { id: 'n5', type: 'send_message', position_x: 1200, position_y: 100, data: { type: 'send_message', subtype: 'text', message: 'Muito obrigado! 🎉 Ficamos felizes com sua avaliação!' } },
        { id: 'n6', type: 'send_message', position_x: 1200, position_y: 350, data: { type: 'send_message', subtype: 'text', message: 'Obrigado pelo feedback. 🙏 Vamos melhorar! Um atendente vai entrar em contato.' } },
        { id: 'n7', type: 'assign_agent', position_x: 1500, position_y: 350, data: { type: 'assign_agent' } },
      ],
      edges: [
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
        { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'branch_b1' },
        { id: 'e5', source_node: 'n4', target_node: 'n6', source_handle: 'branch_b2' },
        { id: 'e6', source_node: 'n6', target_node: 'n7', source_handle: 'success' },
      ],
    },
    {
      id: 'webhook_lead',
      emoji: '🔗',
      name: t('flows.templateWebhookLead'),
      desc: t('flows.templateWebhookLeadDesc'),
      category: t('flows.categoryAdvanced'),
      categoryKey: 'advanced',
      nodes: [
        { id: 'n1', type: 'trigger_webhook', position_x: 50, position_y: 200, data: { type: 'trigger_webhook' } },
        { id: 'n2', type: 'create_contact', position_x: 350, position_y: 200, data: { type: 'create_contact', fields: [{ label: 'Telefone', variable: '{{webhook_phone}}', contactField: 'phone' }, { label: 'Nome', variable: '{{webhook_name}}', contactField: 'name' }, { label: 'Email', variable: '{{webhook_email}}', contactField: 'email' }] } },
        { id: 'n3', type: 'send_message', position_x: 650, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá {{webhook_name}}! Recebemos seu contato. Em breve um consultor vai te atender! 🚀' } },
        { id: 'n4', type: 'tag_contact', position_x: 950, position_y: 100, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n5', type: 'move_pipeline', position_x: 950, position_y: 300, data: { type: 'move_pipeline', stage: 'lead' } },
      ],
      edges: [
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
        { id: 'e4', source_node: 'n3', target_node: 'n5', source_handle: 'success' },
      ],
    },
    {
      id: 'ai_support',
      emoji: '🤖',
      name: t('flows.templateAiSupport'),
      desc: t('flows.templateAiSupportDesc'),
      category: t('flows.categoryAdvanced'),
      categoryKey: 'advanced',
      nodes: [
        { id: 'n1', type: 'trigger_any_reply', position_x: 50, position_y: 200, data: { type: 'trigger_any_reply' } },
        { id: 'n2', type: 'ai', position_x: 350, position_y: 200, data: { type: 'ai', mode: 'classify', classifyOptions: 'duvida, comprar, suporte, reclamação, outro', saveAs: 'intencao' } },
        { id: 'n3', type: 'condition', position_x: 650, position_y: 200, data: { type: 'condition', branches: [{ id: 'b1', label: 'Quer comprar', logic: 'AND', rules: [{ id: 'r1', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'comprar' }] }, { id: 'b2', label: 'Reclamação', logic: 'AND', rules: [{ id: 'r2', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'reclamação' }] }] } },
        { id: 'n4', type: 'ai', position_x: 1000, position_y: 50, data: { type: 'ai', mode: 'respond', systemPrompt: 'Você é um consultor de vendas simpático. Apresente os produtos e benefícios.' } },
        { id: 'n5', type: 'assign_agent', position_x: 1000, position_y: 250, data: { type: 'assign_agent', message: 'Entendo sua preocupação. Vou te conectar com um atendente agora mesmo.' } },
        { id: 'n6', type: 'ai', position_x: 1000, position_y: 400, data: { type: 'ai', mode: 'respond', systemPrompt: 'Você é um assistente prestativo. Responda dúvidas de forma clara e objetiva.' } },
      ],
      edges: [
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'branch_b1' },
        { id: 'e4', source_node: 'n3', target_node: 'n5', source_handle: 'branch_b2' },
        { id: 'e5', source_node: 'n3', target_node: 'n6', source_handle: 'fallback' },
      ],
    },
    {
      id: 'ai_sales_complete',
      emoji: '🎙️',
      name: '🎙️ Vendedor IA Completo',
      desc: 'IA que vende sozinha: entende áudio, responde tudo sobre o produto, qualifica por volume, recomenda plano e faz follow-up',
      category: t('flows.categoryAdvanced'),
      categoryKey: 'advanced',
      nodes: [
        // 1. Trigger: qualquer mensagem
        { id: 'n1', type: 'trigger_any_reply', position_x: 50, position_y: 300, data: { type: 'trigger_any_reply' } },

        // 2. Transcrever áudio (texto passa direto)
        { id: 'n2', type: 'transcribe_audio', position_x: 300, position_y: 300, data: { type: 'transcribe_audio', transcribeSaveAs: 'transcricao' } },

        // 3. IA responde E classifica ao mesmo tempo
        { id: 'n3', type: 'ai', position_x: 550, position_y: 300, data: { type: 'ai', mode: 'respond', historyMessages: 30, systemPrompt: `Você é o assistente comercial do AutoZap no WhatsApp. Responda de forma natural, curta (máx 3 frases) e consultiva. Use emojis com moderação.

IMPORTANTE: No FINAL de TODA resposta, adicione numa linha separada uma dessas tags (invisível pro cliente, é pra classificação interna):
[INTENT:comprar] - quando demonstrou interesse claro em assinar/comprar
[INTENT:testar] - quando quer experimentar/conhecer a plataforma
[INTENT:suporte] - quando é cliente com problema técnico
[INTENT:cancelar] - quando quer cancelar assinatura
[INTENT:humano] - quando pede pra falar com humano/atendente
[INTENT:conversa] - pra todo o resto (dúvidas, curiosidades, saudações)

SOBRE O AUTOZAP:
O AutoZap é uma plataforma profissional de CRM + WhatsApp. Permite gerenciar atendimento, vendas e marketing tudo pelo WhatsApp.

FUNCIONALIDADES:
• Inbox em tempo real — todas as conversas do WhatsApp num só lugar
• CRM de contatos — base completa com tags, campos personalizados, importação CSV/Excel
• Pipeline de vendas — funil kanban com arrasta-e-solta, valores, tarefas
• Campanhas em massa — disparo pra milhares com templates, segmentação, agendamento, recorrência
• Flows de automação — editor visual com 22 tipos de nó (sem programar)
• IA integrada — responde, classifica, extrai dados, resume mensagens
• Transcrição de áudio — cliente manda áudio, o bot entende como texto
• Relatórios — exportação PDF e Excel
• Multi-usuários — equipe com permissões por página e canal
• Integrações — webhooks, Zapier, Make, n8n, qualquer API
• Multi-idioma — português, inglês, espanhol

PLANOS:
• Starter — R$97/mês — 10.000 mensagens — inbox, campanhas, CRM, flows
• Pro — R$197/mês — 50.000 mensagens — tudo do Starter + multi-usuários + suporte prioritário
• Enterprise — R$397/mês — 100.000 mensagens — tudo do Pro + API dedicada + SLA
• Unlimited — R$697/mês — mensagens ilimitadas
• Pagamento mensal, cancela quando quiser
• Pagamento: PIX ou cartão, cancela quando quiser

DIFERENCIAIS (use quando comparar com concorrentes):
• Único que transcreve áudio no WhatsApp automaticamente
• IA nativa (não precisa de ferramenta externa)
• Editor de automação visual (não precisa programar)
• Round-robin automático (distribui leads pro menos ocupado)
• Follow-up automático se lead não responder

PERGUNTAS FREQUENTES:
• "Funciona com meu número?" → Sim, via Gupshup (parceiro oficial do WhatsApp)
• "Precisa de CNPJ?" → Não, pessoa física também pode
• "Posso testar?" → Sim, crie sua conta e escolha um plano para começar
• "Quantos atendentes?" → Starter 1, Pro até 10, Enterprise ilimitado
• "Tem API?" → Sim, webhooks de entrada/saída + REST API
• "É seguro?" → Dados criptografados, LGPD compliant
• "Posso importar contatos?" → Sim, CSV e Excel
• "Integra com Zapier?" → Sim, e também Make, n8n, qualquer webhook
• "Posso enviar imagem/vídeo/documento?" → Sim, todos os tipos de mídia
• "Como configuro?" → Cria conta, conecta número via Gupshup, pronto
• "Demora pra configurar?" → 15 minutos em média
• "Tem suporte?" → Sim, via WhatsApp e email

REGRAS:
- NUNCA invente funcionalidades que não existem
- Se não souber algo específico, diga "Vou verificar com a equipe e te retorno!"
- Se o cliente insistir em falar com humano, responda normalmente e coloque [INTENT:humano]
- Quando recomendar plano, baseie no volume que o cliente informar
- Não repita informações que já deu na conversa (use o histórico)` } },

        // 4. IA extrai a intent da resposta
        { id: 'n4', type: 'ai', position_x: 850, position_y: 300, data: { type: 'ai', mode: 'extract', extractField: 'a tag [INTENT:xxx] da mensagem. Retorne APENAS a palavra depois de INTENT: (comprar, testar, suporte, cancelar, humano ou conversa). Se não encontrar tag, retorne conversa', saveAs: 'intencao', historyMessages: 1 } },

        // 5. Condição por intenção
        { id: 'n5', type: 'condition', position_x: 1150, position_y: 300, data: { type: 'condition', branches: [
          { id: 'b1', label: '💰 Comprar', logic: 'AND', rules: [{ id: 'r1', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'comprar' }] },
          { id: 'b2', label: '🧪 Testar', logic: 'AND', rules: [{ id: 'r2', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'testar' }] },
          { id: 'b3', label: '🔧 Suporte', logic: 'AND', rules: [{ id: 'r3', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'suporte' }] },
          { id: 'b4', label: '❌ Cancelar', logic: 'AND', rules: [{ id: 'r4', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'cancelar' }] },
          { id: 'b5', label: '👤 Humano', logic: 'AND', rules: [{ id: 'r5', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'humano' }] },
        ] } },

        // === COMPRAR ===
        { id: 'n6', type: 'tag_contact', position_x: 1500, position_y: 50, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n7', type: 'move_pipeline', position_x: 1750, position_y: 50, data: { type: 'move_pipeline', stage: 'qualificacao' } },
        { id: 'n8', type: 'input', position_x: 2000, position_y: 50, data: { type: 'input', question: 'Perfeito! 🎯 Pra te recomendar o plano ideal: quantas mensagens você envia por mês aproximadamente?\n\n(pode ser um número aproximado, tipo 5000, 20000, etc)', saveAs: 'volume', timeoutHours: 24 } },
        // Timeout
        { id: 'n9', type: 'send_message', position_x: 2350, position_y: -50, data: { type: 'send_message', subtype: 'text', message: 'Oi! 😊 Vi que não respondeu sobre o volume.\n\nSe quiser, posso te apresentar nossos planos:\n• Starter R$97/mês (10k msgs)\n• Pro R$197/mês (50k msgs)\n• Enterprise R$397/mês (100k msgs)\n\nQual te interessa?' } },
        // Condição volume
        { id: 'n10', type: 'condition', position_x: 2350, position_y: 100, data: { type: 'condition', branches: [
          { id: 'bv1', label: '🏢 Enterprise', logic: 'AND', rules: [{ id: 'rv1', field: 'variable', fieldName: 'volume', operator: 'greater_than', value: '50000' }] },
          { id: 'bv2', label: '🚀 Pro', logic: 'AND', rules: [{ id: 'rv2', field: 'variable', fieldName: 'volume', operator: 'greater_than', value: '5000' }] },
        ] } },
        // Enterprise
        { id: 'n11', type: 'send_message', position_x: 2700, position_y: 0, data: { type: 'send_message', subtype: 'text', message: 'Com esse volume, o Enterprise é ideal pra você! 🏢\n\n✅ 100.000 msgs/mês — R$397\n✅ API dedicada + SLA garantido\n✅ Atendentes ilimitados\n\nVou te passar pro nosso gerente pra uma proposta personalizada!' } },
        { id: 'n12', type: 'move_pipeline', position_x: 3000, position_y: 0, data: { type: 'move_pipeline', stage: 'negociacao' } },
        { id: 'n13', type: 'assign_agent', position_x: 3250, position_y: 0, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Um gerente comercial vai te atender agora! 🚀' } },
        // Pro
        { id: 'n14', type: 'send_message', position_x: 2700, position_y: 150, data: { type: 'send_message', subtype: 'text', message: 'O Pro é perfeito pra esse volume! 🚀\n\n✅ 50.000 msgs/mês — R$197\n✅ Multi-usuários (até 10)\n✅ Suporte prioritário\n\nQuer criar sua conta?' } },
        { id: 'n15', type: 'move_pipeline', position_x: 3000, position_y: 150, data: { type: 'move_pipeline', stage: 'qualificacao' } },
        // Starter (fallback)
        { id: 'n16', type: 'send_message', position_x: 2700, position_y: 300, data: { type: 'send_message', subtype: 'text', message: 'O Starter é ideal pra começar! 💡\n\n✅ 10.000 msgs/mês — R$97\n✅ Inbox + Campanhas + CRM + Flows\n✅ IA integrada\n\nQuer começar agora?' } },
        { id: 'n17', type: 'move_pipeline', position_x: 3000, position_y: 300, data: { type: 'move_pipeline', stage: 'lead' } },

        // === TESTAR ===
        { id: 'n18', type: 'tag_contact', position_x: 1500, position_y: 250, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n19', type: 'send_message', position_x: 1750, position_y: 250, data: { type: 'send_message', subtype: 'text', message: 'Ótima escolha! Cria sua conta aqui:\n\n👉 https://app.autozap.com/register\n\nÉ só criar a conta, escolher o plano e já pode começar.\nSe precisar de ajuda pra configurar, é só chamar aqui!' } },
        { id: 'n20', type: 'move_pipeline', position_x: 2000, position_y: 250, data: { type: 'move_pipeline', stage: 'qualificacao' } },

        // === SUPORTE ===
        { id: 'n21', type: 'tag_contact', position_x: 1500, position_y: 400, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n22', type: 'assign_agent', position_x: 1750, position_y: 400, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Vou te conectar com nosso suporte agora! 🔧 Um momento...' } },

        // === CANCELAR ===
        { id: 'n23', type: 'tag_contact', position_x: 1500, position_y: 530, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n24', type: 'move_pipeline', position_x: 1750, position_y: 530, data: { type: 'move_pipeline', stage: 'lead' } },
        { id: 'n25', type: 'assign_agent', position_x: 2000, position_y: 530, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Entendi. Vou te passar pro responsável pra te ajudar com isso. 🤝' } },

        // === HUMANO ===
        { id: 'n26', type: 'assign_agent', position_x: 1500, position_y: 660, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Claro! Vou te transferir agora. Um momento! 😊' } },

        // === CONVERSA (fallback) — nada, IA já respondeu no n3 ===
        { id: 'n27', type: 'end', position_x: 1500, position_y: 780, data: { type: 'end' } },
      ],
      edges: [
        // Fluxo principal: trigger → transcrever → IA responde → extrair intent → condição
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
        { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'success' },

        // Comprar
        { id: 'e5', source_node: 'n5', target_node: 'n6', source_handle: 'branch_b1' },
        { id: 'e6', source_node: 'n6', target_node: 'n7', source_handle: 'success' },
        { id: 'e7', source_node: 'n7', target_node: 'n8', source_handle: 'success' },
        { id: 'e8', source_node: 'n8', target_node: 'n9', source_handle: 'timeout' },
        { id: 'e9', source_node: 'n8', target_node: 'n10', source_handle: 'success' },
        { id: 'e10', source_node: 'n10', target_node: 'n11', source_handle: 'branch_bv1' },
        { id: 'e11', source_node: 'n11', target_node: 'n12', source_handle: 'success' },
        { id: 'e12', source_node: 'n12', target_node: 'n13', source_handle: 'success' },
        { id: 'e13', source_node: 'n10', target_node: 'n14', source_handle: 'branch_bv2' },
        { id: 'e14', source_node: 'n14', target_node: 'n15', source_handle: 'success' },
        { id: 'e15', source_node: 'n10', target_node: 'n16', source_handle: 'fallback' },
        { id: 'e16', source_node: 'n16', target_node: 'n17', source_handle: 'success' },

        // Testar
        { id: 'e17', source_node: 'n5', target_node: 'n18', source_handle: 'branch_b2' },
        { id: 'e18', source_node: 'n18', target_node: 'n19', source_handle: 'success' },
        { id: 'e19', source_node: 'n19', target_node: 'n20', source_handle: 'success' },

        // Suporte
        { id: 'e20', source_node: 'n5', target_node: 'n21', source_handle: 'branch_b3' },
        { id: 'e21', source_node: 'n21', target_node: 'n22', source_handle: 'success' },

        // Cancelar
        { id: 'e22', source_node: 'n5', target_node: 'n23', source_handle: 'branch_b4' },
        { id: 'e23', source_node: 'n23', target_node: 'n24', source_handle: 'success' },
        { id: 'e24', source_node: 'n24', target_node: 'n25', source_handle: 'success' },

        // Humano
        { id: 'e25', source_node: 'n5', target_node: 'n26', source_handle: 'branch_b5' },

        // Conversa (fallback) — IA já respondeu, só finaliza
        { id: 'e26', source_node: 'n5', target_node: 'n27', source_handle: 'fallback' },
      ],
    },
    {
      id: 'demo_all_nodes',
      emoji: '🧪',
      name: '🧪 Demonstração — Todos os Nós',
      desc: 'Flow de teste que usa todos os nós novos: variável, cálculo, tarefa, notificação, teste A/B e caminho aleatório',
      category: t('flows.categoryAdvanced'),
      categoryKey: 'advanced',
      nodes: [
        // 1. Trigger
        { id: 'n1', type: 'trigger_any_reply', position_x: 50, position_y: 300, data: { type: 'trigger_any_reply' } },

        // 2. Transcrever áudio
        { id: 'n2', type: 'transcribe_audio', position_x: 300, position_y: 300, data: { type: 'transcribe_audio', transcribeSaveAs: 'transcricao' } },

        // 3. Definir variável — inicia score com 0
        { id: 'n3', type: 'set_variable', position_x: 550, position_y: 300, data: { type: 'set_variable', variableName: 'score', variableValue: '0' } },

        // 4. Cálculo — soma 10 pontos por ter mandado mensagem
        { id: 'n4', type: 'math', position_x: 800, position_y: 300, data: { type: 'math', mathVariable: 'score', mathOperator: '+', mathValue: '10' } },

        // 5. Teste A/B — divide em 2 caminhos
        { id: 'n5', type: 'split_ab', position_x: 1050, position_y: 300, data: { type: 'split_ab', splitPaths: [{ label: 'A', weight: 50 }, { label: 'B', weight: 50 }] } },

        // 6A. Caminho A — mensagem formal
        { id: 'n6', type: 'send_message', position_x: 1350, position_y: 150, data: { type: 'send_message', subtype: 'text', message: '🅰️ Olá! Obrigado por entrar em contato. Como posso ajudá-lo hoje?\n\n(Você caiu no caminho A do teste A/B)\n\nSeu score atual: {{score}} pontos' } },

        // 6B. Caminho B — mensagem informal
        { id: 'n7', type: 'send_message', position_x: 1350, position_y: 450, data: { type: 'send_message', subtype: 'text', message: '🅱️ Fala! Beleza? 😄 Que bom que mandou mensagem!\n\n(Você caiu no caminho B do teste A/B)\n\nSeu score atual: {{score}} pontos' } },

        // 7. Cálculo — soma mais 20 pontos (interagiu)
        { id: 'n8', type: 'math', position_x: 1650, position_y: 300, data: { type: 'math', mathVariable: 'score', mathOperator: '+', mathValue: '20' } },

        // 8. Criar tarefa — lembrete de follow-up
        { id: 'n9', type: 'create_task', position_x: 1900, position_y: 300, data: { type: 'create_task', taskTitle: 'Follow-up com {{phone}} — score {{score}}', taskDueHours: 24 } },

        // 9. Notificar agente
        { id: 'n10', type: 'send_notification', position_x: 2150, position_y: 300, data: { type: 'send_notification', notificationMessage: 'Novo lead com score {{score}}! Caminho: {{ab_path}}' } },

        // 10. Caminho aleatório — 3 mensagens de despedida
        { id: 'n11', type: 'random_path', position_x: 2400, position_y: 300, data: { type: 'random_path', randomPaths: ['A', 'B', 'C'] } },

        // 11A. Despedida 1
        { id: 'n12', type: 'send_message', position_x: 2700, position_y: 100, data: { type: 'send_message', subtype: 'text', message: '✅ Tudo certo! Sua tarefa de follow-up foi criada.\n\nScore final: {{score}} pontos\nCaminho A/B: {{ab_path}}\nCaminho aleatório: {{random_path}}\n\n(Despedida versão 1 de 3)' } },

        // 11B. Despedida 2
        { id: 'n13', type: 'send_message', position_x: 2700, position_y: 300, data: { type: 'send_message', subtype: 'text', message: '🎯 Perfeito! Já criei um lembrete pra entrar em contato.\n\nScore: {{score}} | Teste A/B: {{ab_path}} | Random: {{random_path}}\n\n(Despedida versão 2 de 3)' } },

        // 11C. Despedida 3
        { id: 'n14', type: 'send_message', position_x: 2700, position_y: 500, data: { type: 'send_message', subtype: 'text', message: '🚀 Show! Tá tudo registrado.\n\nPontuação: {{score}} | Grupo: {{ab_path}} | Sorteio: {{random_path}}\n\n(Despedida versão 3 de 3)' } },

        // 12. Definir variável — marca que passou pelo demo
        { id: 'n15', type: 'set_variable', position_x: 3000, position_y: 300, data: { type: 'set_variable', variableName: 'demo_completo', variableValue: 'sim' } },

        // 13. Tag
        { id: 'n16', type: 'tag_contact', position_x: 3250, position_y: 300, data: { type: 'tag_contact', subtype: 'add' } },

        // 14. Fim
        { id: 'n17', type: 'end', position_x: 3500, position_y: 300, data: { type: 'end', message: '🏁 Demo completo! Todos os nós foram testados. Variável demo_completo = {{demo_completo}}' } },
      ],
      edges: [
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
        { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'success' },
        // A/B split
        { id: 'e5', source_node: 'n5', target_node: 'n6', source_handle: 'split_0' },
        { id: 'e6', source_node: 'n5', target_node: 'n7', source_handle: 'split_1' },
        // Ambos convergem
        { id: 'e7', source_node: 'n6', target_node: 'n8', source_handle: 'success' },
        { id: 'e8', source_node: 'n7', target_node: 'n8', source_handle: 'success' },
        // Continua
        { id: 'e9', source_node: 'n8', target_node: 'n9', source_handle: 'success' },
        { id: 'e10', source_node: 'n9', target_node: 'n10', source_handle: 'success' },
        { id: 'e11', source_node: 'n10', target_node: 'n11', source_handle: 'success' },
        // Random path
        { id: 'e12', source_node: 'n11', target_node: 'n12', source_handle: 'random_0' },
        { id: 'e13', source_node: 'n11', target_node: 'n13', source_handle: 'random_1' },
        { id: 'e14', source_node: 'n11', target_node: 'n14', source_handle: 'random_2' },
        // Todos convergem pro final
        { id: 'e15', source_node: 'n12', target_node: 'n15', source_handle: 'success' },
        { id: 'e16', source_node: 'n13', target_node: 'n15', source_handle: 'success' },
        { id: 'e17', source_node: 'n14', target_node: 'n15', source_handle: 'success' },
        { id: 'e18', source_node: 'n15', target_node: 'n16', source_handle: 'success' },
        { id: 'e19', source_node: 'n16', target_node: 'n17', source_handle: 'success' },
      ],
    },
  ]
}

function getCooldownOptions(t: (key: string) => string) {
  return [
    { value: '24h',    label: t('flows.cooldown24h'),    desc: t('flows.cooldown24hDesc') },
    { value: 'once',   label: t('flows.cooldownOnce'),   desc: t('flows.cooldownOnceDesc') },
    { value: 'always', label: t('flows.cooldownAlways'), desc: t('flows.cooldownAlwaysDesc') },
  ]
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '14px', outline: 'none', color: 'var(--text)',
  transition: 'border-color 0.15s, background 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: '#52525b', marginBottom: '5px',
}

function CooldownSelector({ value, onChange, t }: { value: string; onChange: (v: string) => void; t: (key: string) => string }) {
  const COOLDOWN_OPTIONS = getCooldownOptions(t)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {COOLDOWN_OPTIONS.map(opt => (
        <div key={opt.value} onClick={() => onChange(opt.value)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', border: `1.5px solid ${value === opt.value ? '#22c55e' : 'var(--border)'}`, background: value === opt.value ? '#f0fdf4' : 'var(--bg-input)', transition: 'all 0.1s' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${value === opt.value ? '#22c55e' : 'var(--text-faintest)'}`, background: value === opt.value ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {value === opt.value && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: value === opt.value ? '#15803d' : 'var(--text)' }}>{opt.label}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '1px' }}>{opt.desc}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function FlowsPage() {
  const t = useT()
  const { canEdit, canDelete } = usePermissions()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newChannelId, setNewChannelId] = useState('')
  const [newCooldown, setNewCooldown] = useState('24h')
  const [editingFlow, setEditingFlow] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editChannelId, setEditChannelId] = useState('')
  const [editCooldown, setEditCooldown] = useState('24h')

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: async () => { const { data } = await messageApi.get('/flows'); return data.data || [] },
  })

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })

  const FLOW_TEMPLATES = getFlowTemplates(t)
  const COOLDOWN_OPTIONS = getCooldownOptions(t)

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await messageApi.post('/flows', { name: newName, channelId: newChannelId || null, cooldown_type: newCooldown })
      return data.data
    },
    onSuccess: (flow) => {
      toast.success(t('flows.toastCreated'))
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      setShowNew(false); setNewName(''); setNewChannelId(''); setNewCooldown('24h')
      router.push(`/dashboard/flows/${flow.id}`)
    },
    onError: () => toast.error(t('flows.toastCreateError')),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      await messageApi.patch(`/flows/${editingFlow.id}`, { name: editName, channelId: editChannelId || null, cooldown_type: editCooldown })
    },
    onSuccess: () => { toast.success(t('flows.toastUpdated')); queryClient.invalidateQueries({ queryKey: ['flows'] }); setEditingFlow(null) },
    onError: () => toast.error(t('flows.toastUpdateError')),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await messageApi.patch(`/flows/${id}`, { is_active: !isActive })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
    onError: () => toast.error(t('flows.toastUpdateError')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await messageApi.delete(`/flows/${id}`) },
    onSuccess: () => { toast.success(t('flows.toastDeleted')); queryClient.invalidateQueries({ queryKey: ['flows'] }) },
    onError: () => toast.error(t('flows.toastDeleteError')),
  })

  const openEdit = (f: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingFlow(f); setEditName(f.name); setEditChannelId(f.channel_id || ''); setEditCooldown(f.cooldown_type || '24h')
  }

  const channelName = (channelId: string) => channels.find((c: any) => c.id === channelId)?.name || t('flows.allChannels')
  const cooldownLabel = (type: string) => COOLDOWN_OPTIONS.find(o => o.value === type)?.label || t('flows.cooldown24h')

  return (
    <div className="mobile-page" style={{ padding: '32px', maxWidth: '900px' }}>

      {/* Header */}
      <div className="mobile-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>{t('flows.title')}</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: '14px', marginTop: '3px' }}>{t('flows.subtitleAlt')}</p>
        </div>
        <div className="mobile-header-actions" style={{ display: 'flex', gap: '8px' }}>
          {canEdit('/dashboard/flows') && (
          <button onClick={() => setShowTemplates(true)}
            style={{ padding: '9px 16px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Copy size={14} /> {t('flows.templates')}
          </button>
          )}
          {canEdit('/dashboard/flows') && (
          <button onClick={() => setShowNew(true)}
            style={{ padding: '9px 16px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#16a34a'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#22c55e'}>
            <Plus size={14} /> {t('flows.new')}
          </button>
          )}
        </div>
      </div>

      {/* Form novo flow */}
      {showNew && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '14px', letterSpacing: '-0.01em' }}>{t('flows.newFlow')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={labelStyle}>{t('flows.nameLabel')}</label>
              <input style={inputStyle} placeholder={t('flows.namePlaceholder')} value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = 'var(--bg-card)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-input)' }} />
            </div>
            <div>
              <label style={labelStyle}>{t('flows.channel')}</label>
              <select style={{ ...inputStyle }} value={newChannelId} onChange={e => setNewChannelId(e.target.value)}>
                <option value="">{t('flows.allChannels')}</option>
                {channels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={12} /> {t('flows.cooldownLabel')}
            </label>
            <CooldownSelector value={newCooldown} onChange={setNewCooldown} t={t} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}
              style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !newName ? 0.5 : 1 }}>
              {createMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={13} />}
              {t('flows.createAndOpen')}
            </button>
            <button onClick={() => { setShowNew(false); setNewName('') }}
              style={{ padding: '9px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Modal de edição */}
      {editingFlow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEditingFlow(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '24px', width: '480px', boxShadow: '0 24px 60px rgba(0,0,0,.12)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>{t('flows.editFlow')}</h3>
              <button onClick={() => setEditingFlow(null)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '6px', display: 'flex' }}>
                <X size={15} color="var(--text-muted)" />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={labelStyle}>{t('flows.nameLabel')}</label>
                <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                  onFocus={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = 'var(--bg-card)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-input)' }} />
              </div>
              <div>
                <label style={labelStyle}>{t('flows.channel')}</label>
                <select style={{ ...inputStyle }} value={editChannelId} onChange={e => setEditChannelId(e.target.value)}>
                  <option value="">{t('flows.allChannels')}</option>
                  {channels.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Clock size={12} /> {t('flows.cooldownShort')}
                </label>
                <CooldownSelector value={editCooldown} onChange={setEditCooldown} t={t} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => updateMutation.mutate()} disabled={!editName || updateMutation.isPending}
                style={{ padding: '10px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !editName ? 0.5 : 1 }}>
                {updateMutation.isPending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                {t('common.save')}
              </button>
              <button onClick={() => setEditingFlow(null)}
                style={{ padding: '10px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', color: '#52525b' }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div style={{ padding: '20px' }}>
          <ListSkeleton rows={5} />
        </div>
      ) : flows.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '80px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <Workflow size={24} color="var(--text-faintest)" />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500, marginBottom: '6px' }}>{t('flows.noFlowsShort')}</p>
          <p style={{ color: 'var(--text-faint)', fontSize: '13px', marginBottom: '20px' }}>{t('flows.createFirstAlt')}</p>
          {canEdit('/dashboard/flows') && (
          <button onClick={() => setShowNew(true)}
            style={{ padding: '9px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            {t('flows.createFirstFlow')}
          </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {flows.map((f: any) => (
            <div key={f.id}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
              onClick={() => router.push(`/dashboard/flows/${f.id}`)}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,.07)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,.04)' }}>

              <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: f.is_active ? '#f0fdf4' : 'var(--bg)', border: `1px solid ${f.is_active ? '#bbf7d0' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Workflow size={16} color={f.is_active ? '#22c55e' : 'var(--text-faintest)'} />
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', letterSpacing: '-0.01em' }}>{f.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '99px', background: f.is_active ? '#dcfce7' : 'var(--bg)', color: f.is_active ? '#15803d' : 'var(--text-faint)', border: `1px solid ${f.is_active ? '#bbf7d0' : 'var(--border)'}` }}>
                    {f.is_active ? t('flows.active') : t('flows.paused')}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                  {f.node_count || 0} {t('flows.nodes')} · {f.channel_id ? channelName(f.channel_id) : t('flows.allChannels')} · {cooldownLabel(f.cooldown_type || '24h')}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                {canEdit('/dashboard/flows') && (
                <button onClick={() => toggleMutation.mutate({ id: f.id, isActive: f.is_active })} title={f.is_active ? t('flows.togglePause') : t('flows.toggleActivate')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: f.is_active ? '#22c55e' : 'var(--text-faintest)', borderRadius: '6px' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}>
                  {f.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
                )}
                {canEdit('/dashboard/flows') && (
                <button onClick={e => openEdit(f, e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: 'var(--text-faint)', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}>
                  <Pencil size={14} />
                </button>
                )}
                {canDelete('/dashboard/flows') && (
                <button onClick={() => { if (confirm(t('flows.confirmDelete').replace('{name}', f.name))) deleteMutation.mutate(f.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px', display: 'flex', color: 'var(--text-faint)', borderRadius: '6px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}>
                  <Trash2 size={14} />
                </button>
                )}
                <ChevronRight size={15} color="var(--text-faintest)" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de templates */}
      {showTemplates && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('flows.templateTitle')}</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '3px' }}>{t('flows.templateSubtitle')}</p>
              </div>
              <button onClick={() => setShowTemplates(false)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '7px', cursor: 'pointer', padding: '6px', display: 'flex' }}><X size={15} color="var(--text-muted)" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {['simple', 'intermediate', 'advanced'].map(catKey => {
                const templates = FLOW_TEMPLATES.filter(tmpl => tmpl.categoryKey === catKey)
                if (templates.length === 0) return null
                const catLabel = templates[0].category
                return (
                  <div key={catKey} style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{catLabel}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {templates.map(tmpl => (
                        <div key={tmpl.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.1s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#7c3aed'; (e.currentTarget as HTMLDivElement).style.background = '#faf5ff' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                          onClick={async () => {
                            setCreatingTemplate(true)
                            try {
                              const { data: flowData } = await messageApi.post('/flows', { name: tmpl.name, cooldown_type: 'always' })
                              const flowId = flowData.data.id
                              const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
                              const idMap: Record<string, string> = {}
                              const nodes = tmpl.nodes.map(n => { const newId = uid(); idMap[n.id] = newId; return { ...n, id: newId } })
                              const edges = tmpl.edges.map(e => ({ ...e, id: uid(), source_node: idMap[e.source_node], target_node: idMap[e.target_node] }))
                              await messageApi.put(`/flows/${flowId}/graph`, { nodes, edges })
                              toast.success(t('flows.toastTemplateCreated').replace('{name}', tmpl.name))
                              queryClient.invalidateQueries({ queryKey: ['flows'] })
                              setShowTemplates(false)
                              router.push(`/dashboard/flows/${flowId}`)
                            } catch { toast.error(t('flows.toastTemplateError')) }
                            finally { setCreatingTemplate(false) }
                          }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                            {tmpl.emoji}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{tmpl.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{tmpl.desc}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '3px' }}>{tmpl.nodes.length} {t('flows.nodes')} · {tmpl.edges.length} {t('flows.connections')}</div>
                          </div>
                          {creatingTemplate ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#7c3aed' }} /> : <ChevronRight size={16} color="var(--text-faintest)" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
