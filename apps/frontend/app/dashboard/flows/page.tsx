'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { messageApi, channelApi, tenantApi, campaignApi } from '@/lib/api'
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
        { id: 'n2', type: 'send_message', position_x: 400, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! 👋 Seja bem-vindo(a)! Como posso ajudar?' } },
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
        { id: 'n2', type: 'send_message', position_x: 400, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá! No momento estamos fora do horário de atendimento. Deixe sua mensagem que retornaremos em breve! 😊' } },
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
        { id: 'n4', type: 'send_message', position_x: 880, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Prazer, {{nome}}! Como posso ajudar?\n\n1️⃣ Informações\n2️⃣ Agendar\n3️⃣ Falar com atendente' } },
        { id: 'n5', type: 'input', position_x: 1160, position_y: 200, data: { type: 'input', question: '', saveAs: 'interesse' } },
        { id: 'n6', type: 'tag_contact', position_x: 1440, position_y: 100, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n7', type: 'move_pipeline', position_x: 1440, position_y: 300, data: { type: 'move_pipeline', stage: 'qualificacao' } },
        { id: 'n8', type: 'assign_agent', position_x: 1720, position_y: 200, data: { type: 'assign_agent', message: 'Obrigado, {{nome}}! Já vou te conectar com um atendente. 🚀' } },
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
        { id: 'n3', type: 'send_message', position_x: 650, position_y: 200, data: { type: 'send_message', subtype: 'text', message: 'Olá {{webhook_name}}! Recebemos seu contato. Em breve retornaremos! 🚀' } },
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
        { id: 'n2', type: 'ai', position_x: 350, position_y: 200, data: { type: 'ai', mode: 'classify', classifyOptions: 'informacao, agendar, reclamacao, outro', saveAs: 'intencao' } },
        { id: 'n3', type: 'condition', position_x: 650, position_y: 200, data: { type: 'condition', branches: [{ id: 'b1', label: 'Quer agendar', logic: 'AND', rules: [{ id: 'r1', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'agendar' }] }, { id: 'b2', label: 'Reclamação', logic: 'AND', rules: [{ id: 'r2', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'reclamacao' }] }] } },
        { id: 'n4', type: 'ai', position_x: 1000, position_y: 50, data: { type: 'ai', mode: 'respond', systemPrompt: 'Você é um assistente simpático. Ajude o cliente a agendar ou tirar dúvidas.' } },
        { id: 'n5', type: 'assign_agent', position_x: 1000, position_y: 250, data: { type: 'assign_agent', message: 'Entendo sua situação. Vou te conectar com um atendente agora mesmo.' } },
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
      id: 'ai_full_assistant',
      emoji: '🎙️',
      name: '🎙️ Assistente IA Completo',
      desc: 'IA que atende sozinha: entende áudio, classifica intenção, responde dúvidas e encaminha para atendente quando necessário',
      category: t('flows.categoryAdvanced'),
      categoryKey: 'advanced',
      nodes: [
        // 1. Trigger: qualquer mensagem
        { id: 'n1', type: 'trigger_any_reply', position_x: 50, position_y: 300, data: { type: 'trigger_any_reply' } },

        // 2. Transcrever áudio (texto passa direto)
        { id: 'n2', type: 'transcribe_audio', position_x: 300, position_y: 300, data: { type: 'transcribe_audio', transcribeSaveAs: 'transcricao' } },

        // 3. IA responde E classifica ao mesmo tempo
        { id: 'n3', type: 'ai', position_x: 550, position_y: 300, data: { type: 'ai', mode: 'respond', historyMessages: 30, systemPrompt: `Você é o assistente virtual da empresa no WhatsApp. Responda de forma natural, curta (máx 3 frases) e prestativa. Use emojis com moderação.

IMPORTANTE: No FINAL de TODA resposta, adicione numa linha separada uma dessas tags (invisível pro cliente, é pra classificação interna):
[INTENT:comprar] - quando demonstrou interesse claro em contratar/comprar
[INTENT:agendar] - quando quer marcar horário ou agendar algo
[INTENT:suporte] - quando é cliente com problema ou dúvida técnica
[INTENT:cancelar] - quando quer cancelar algo
[INTENT:humano] - quando pede pra falar com humano/atendente
[INTENT:conversa] - pra todo o resto (dúvidas, curiosidades, saudações)

REGRAS:
- Responda com base no contexto da conversa
- Se não souber algo específico, diga "Vou verificar com a equipe e te retorno!"
- Se o cliente insistir em falar com humano, responda normalmente e coloque [INTENT:humano]
- Não repita informações que já deu na conversa (use o histórico)

IMPORTANTE: Personalize este prompt com informações do seu negócio (serviços, preços, horários, etc.)` } },

        // 4. IA extrai a intent da resposta
        { id: 'n4', type: 'ai', position_x: 850, position_y: 300, data: { type: 'ai', mode: 'extract', extractField: 'a tag [INTENT:xxx] da mensagem. Retorne APENAS a palavra depois de INTENT: (comprar, agendar, suporte, cancelar, humano ou conversa). Se não encontrar tag, retorne conversa', saveAs: 'intencao', historyMessages: 1 } },

        // 5. Condição por intenção
        { id: 'n5', type: 'condition', position_x: 1150, position_y: 300, data: { type: 'condition', branches: [
          { id: 'b1', label: '💰 Comprar', logic: 'AND', rules: [{ id: 'r1', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'comprar' }] },
          { id: 'b2', label: '📅 Agendar', logic: 'AND', rules: [{ id: 'r2', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'agendar' }] },
          { id: 'b3', label: '🔧 Suporte', logic: 'AND', rules: [{ id: 'r3', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'suporte' }] },
          { id: 'b4', label: '❌ Cancelar', logic: 'AND', rules: [{ id: 'r4', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'cancelar' }] },
          { id: 'b5', label: '👤 Humano', logic: 'AND', rules: [{ id: 'r5', field: 'variable', fieldName: 'intencao', operator: 'contains', value: 'humano' }] },
        ] } },

        // === COMPRAR ===
        { id: 'n6', type: 'tag_contact', position_x: 1500, position_y: 50, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n7', type: 'move_pipeline', position_x: 1750, position_y: 50, data: { type: 'move_pipeline', stage: 'em_andamento' } },
        { id: 'n8', type: 'assign_agent', position_x: 2000, position_y: 50, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Ótimo! Vou te conectar com um atendente para finalizar. 🚀' } },

        // === AGENDAR ===
        { id: 'n9', type: 'tag_contact', position_x: 1500, position_y: 200, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n10', type: 'assign_agent', position_x: 1750, position_y: 200, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Vou te conectar com a equipe para agendar! 📅' } },

        // === SUPORTE ===
        { id: 'n11', type: 'tag_contact', position_x: 1500, position_y: 350, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n12', type: 'assign_agent', position_x: 1750, position_y: 350, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Vou te conectar com o suporte agora! 🔧' } },

        // === CANCELAR ===
        { id: 'n13', type: 'tag_contact', position_x: 1500, position_y: 500, data: { type: 'tag_contact', subtype: 'add' } },
        { id: 'n14', type: 'assign_agent', position_x: 1750, position_y: 500, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Entendi. Vou te passar pro responsável. 🤝' } },

        // === HUMANO ===
        { id: 'n15', type: 'assign_agent', position_x: 1500, position_y: 630, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Claro! Vou te transferir agora. Um momento! 😊' } },

        // === CONVERSA (fallback) — IA já respondeu no n3 ===
        { id: 'n16', type: 'end', position_x: 1500, position_y: 750, data: { type: 'end' } },
      ],
      edges: [
        // Fluxo principal: trigger → transcrever → IA responde → extrair intent → condição
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
        { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'success' },

        // Comprar → tag + pipeline + atribuir
        { id: 'e5', source_node: 'n5', target_node: 'n6', source_handle: 'branch_b1' },
        { id: 'e6', source_node: 'n6', target_node: 'n7', source_handle: 'success' },
        { id: 'e7', source_node: 'n7', target_node: 'n8', source_handle: 'success' },

        // Agendar → tag + atribuir
        { id: 'e8', source_node: 'n5', target_node: 'n9', source_handle: 'branch_b2' },
        { id: 'e9', source_node: 'n9', target_node: 'n10', source_handle: 'success' },

        // Suporte → tag + atribuir
        { id: 'e10', source_node: 'n5', target_node: 'n11', source_handle: 'branch_b3' },
        { id: 'e11', source_node: 'n11', target_node: 'n12', source_handle: 'success' },

        // Cancelar → tag + atribuir
        { id: 'e12', source_node: 'n5', target_node: 'n13', source_handle: 'branch_b4' },
        { id: 'e13', source_node: 'n13', target_node: 'n14', source_handle: 'success' },

        // Humano → atribuir
        { id: 'e14', source_node: 'n5', target_node: 'n15', source_handle: 'branch_b5' },

        // Conversa (fallback) — IA já respondeu, só finaliza
        { id: 'e15', source_node: 'n5', target_node: 'n16', source_handle: 'fallback' },
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
    {
      id: 'full_service_scheduling',
      emoji: '🏟️',
      name: '🏟️ Atendimento completo com agendamento e reservas',
      desc: 'Menu multinível: informações, reservas com atendente, consulta de horários via webhook, validação, pagamento PIX. Ideal pra complexos, clínicas, quadras.',
      category: t('flows.categoryAdvanced'),
      categoryKey: 'advanced',
      nodes: [
        // ═══ NÍVEL 0: TRIGGER ═══
        { id: 'n1', type: 'trigger_keyword', position_x: 600, position_y: 0, data: { type: 'trigger_keyword', keywords: ['menu', 'início', 'inicio', 'começar', 'opcoes', 'opções'], matchType: 'contains' } },

        // ═══ NÍVEL 1: MENU PRINCIPAL ═══
        { id: 'n2', type: 'send_message', position_x: 600, position_y: 150, data: { type: 'send_message', subtype: 'buttons', message: 'Olá! 👋 Sou o atendente digital.\nSelecione o setor que gostaria de informações:', buttons: [{ title: 'Outro Assunto' }, { title: 'Reservas' }, { title: 'Quadra' }] } },
        { id: 'n3', type: 'input', position_x: 600, position_y: 300, data: { type: 'input', question: '', saveAs: 'menu_principal', timeoutHours: 1 } },
        { id: 'n4', type: 'condition', position_x: 600, position_y: 450, data: { type: 'condition', branches: [
          { id: 'b1', label: 'Outro Assunto', logic: 'AND', rules: [{ id: 'r1', field: 'variable', fieldName: 'menu_principal', operator: 'contains', value: 'Outro' }] },
          { id: 'b2', label: 'Reservas', logic: 'AND', rules: [{ id: 'r2', field: 'variable', fieldName: 'menu_principal', operator: 'contains', value: 'Reserva' }] },
          { id: 'b3', label: 'Quadra', logic: 'AND', rules: [{ id: 'r3', field: 'variable', fieldName: 'menu_principal', operator: 'contains', value: 'Quadra' }] },
        ] } },
        { id: 'nf1', type: 'send_message', position_x: 300, position_y: 550, data: { type: 'send_message', subtype: 'text', message: 'Desculpe, não entendi sua resposta. Vamos tentar novamente!' } },

        // ═══ COLUNA ESQUERDA: OUTRO ASSUNTO ═══
        { id: 'n5', type: 'send_message', position_x: 0, position_y: 650, data: { type: 'send_message', subtype: 'buttons', message: 'Selecione o assunto:', buttons: [{ title: 'Campeonato' }, { title: 'Escolinha' }, { title: 'Ayrton Senna' }] } },
        { id: 'n6', type: 'input', position_x: 0, position_y: 800, data: { type: 'input', question: '', saveAs: 'outro_assunto', timeoutHours: 1 } },
        { id: 'n7', type: 'condition', position_x: 0, position_y: 950, data: { type: 'condition', branches: [
          { id: 'bo1', label: 'Campeonato', logic: 'AND', rules: [{ id: 'ro1', field: 'variable', fieldName: 'outro_assunto', operator: 'contains', value: 'Campeonato' }] },
          { id: 'bo2', label: 'Escolinha', logic: 'AND', rules: [{ id: 'ro2', field: 'variable', fieldName: 'outro_assunto', operator: 'contains', value: 'Escolinha' }] },
          { id: 'bo3', label: 'Ayrton Senna', logic: 'AND', rules: [{ id: 'ro3', field: 'variable', fieldName: 'outro_assunto', operator: 'contains', value: 'Senna' }] },
        ] } },
        { id: 'nf2', type: 'send_message', position_x: -300, position_y: 1050, data: { type: 'send_message', subtype: 'text', message: 'Não entendi. Vamos tentar novamente!' } },
        { id: 'n8', type: 'send_message', position_x: -300, position_y: 1150, data: { type: 'send_message', subtype: 'text', message: '[Informações sobre o Campeonato]\n\nFale com o responsável pelo link:\nwa.me/55XXXXXXXXXXX' } },
        { id: 'n10', type: 'send_message', position_x: 0, position_y: 1150, data: { type: 'send_message', subtype: 'text', message: 'Agradecemos o seu contato, este setor é por este link:\nwa.me/55XXXXXXXXXXX' } },
        { id: 'n12', type: 'send_message', position_x: 300, position_y: 1150, data: { type: 'send_message', subtype: 'text', message: 'Agradecemos o seu contato, este setor é por este link:\nwa.me/55XXXXXXXXXXX' } },
        // "Posso ajudar?"
        { id: 'na1', type: 'send_message', position_x: 0, position_y: 1350, data: { type: 'send_message', subtype: 'buttons', message: 'Posso ajudar em mais alguma coisa?', buttons: [{ title: 'Sim, voltar ao menu' }, { title: 'Não, obrigado' }] } },
        { id: 'na2', type: 'input', position_x: 0, position_y: 1500, data: { type: 'input', question: '', saveAs: 'ajudar_mais', timeoutHours: 1 } },
        { id: 'na3', type: 'condition', position_x: 0, position_y: 1650, data: { type: 'condition', branches: [
          { id: 'ba1', label: 'Sim', logic: 'AND', rules: [{ id: 'ra1', field: 'variable', fieldName: 'ajudar_mais', operator: 'contains', value: 'Sim' }] },
        ] } },
        { id: 'na4', type: 'send_message', position_x: 0, position_y: 1800, data: { type: 'send_message', subtype: 'text', message: 'Obrigado pelo contato! Se precisar, digite *menu* para voltar ao início. 😊' } },
        { id: 'na5', type: 'end', position_x: 0, position_y: 1950, data: { type: 'end' } },

        // ═══ COLUNA CENTRAL: RESERVAS ═══
        { id: 'n14', type: 'send_message', position_x: 600, position_y: 650, data: { type: 'send_message', subtype: 'buttons', message: 'Qual tipo de reserva?', buttons: [{ title: 'Churrasqueira' }, { title: 'Eventos' }] } },
        { id: 'n15', type: 'input', position_x: 600, position_y: 800, data: { type: 'input', question: '', saveAs: 'tipo_reserva', timeoutHours: 1 } },
        { id: 'n16', type: 'condition', position_x: 600, position_y: 950, data: { type: 'condition', branches: [
          { id: 'br1', label: 'Churrasqueira', logic: 'AND', rules: [{ id: 'rr1', field: 'variable', fieldName: 'tipo_reserva', operator: 'contains', value: 'Churrasqueira' }] },
          { id: 'br2', label: 'Eventos', logic: 'AND', rules: [{ id: 'rr2', field: 'variable', fieldName: 'tipo_reserva', operator: 'contains', value: 'Evento' }] },
        ] } },
        { id: 'nf3', type: 'send_message', position_x: 600, position_y: 1050, data: { type: 'send_message', subtype: 'text', message: 'Não entendi. Vamos tentar novamente!' } },
        { id: 'n17', type: 'assign_agent', position_x: 500, position_y: 1150, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Vou te conectar com o responsável pela Churrasqueira/Cozinha! 😊' } },
        { id: 'n18', type: 'assign_agent', position_x: 700, position_y: 1150, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Vou te conectar com o setor de Eventos! 😊' } },

        // ═══ COLUNA DIREITA: QUADRA ═══
        { id: 'n19', type: 'send_message', position_x: 1200, position_y: 650, data: { type: 'send_message', subtype: 'buttons', message: 'Selecione uma opção:', buttons: [{ title: 'Horários disponíveis' }, { title: 'Sou Mensalista' }] } },
        { id: 'n20', type: 'input', position_x: 1200, position_y: 800, data: { type: 'input', question: '', saveAs: 'opcao_quadra', timeoutHours: 1 } },
        { id: 'n21', type: 'condition', position_x: 1200, position_y: 950, data: { type: 'condition', branches: [
          { id: 'bq1', label: 'Horários', logic: 'AND', rules: [{ id: 'rq1', field: 'variable', fieldName: 'opcao_quadra', operator: 'contains', value: 'Horário' }] },
          { id: 'bq2', label: 'Mensalista', logic: 'AND', rules: [{ id: 'rq2', field: 'variable', fieldName: 'opcao_quadra', operator: 'contains', value: 'Mensalista' }] },
        ] } },
        { id: 'nf4', type: 'send_message', position_x: 1500, position_y: 1050, data: { type: 'send_message', subtype: 'text', message: 'Não entendi. Vamos tentar novamente!' } },
        { id: 'n22', type: 'assign_agent', position_x: 1500, position_y: 1150, data: { type: 'assign_agent', agentId: 'round_robin', message: 'Vou te conectar com o responsável pelos mensalistas! 😊' } },

        // ── ESCOLHER QUADRA (abaixo da coluna direita) ──
        { id: 'n23', type: 'send_message', position_x: 1200, position_y: 1150, data: { type: 'send_message', subtype: 'buttons', message: 'Temos horários nas duas quadras:\n\n🏟️ Quadra Externa — 40m x 25m\nrecomenda-se 5 na linha + goleiro\n\n🏠 Quadra Interna — 46m x 26m\nrecomenda-se 6 na linha + goleiro', buttons: [{ title: 'Quadra Interna' }, { title: 'Quadra Externa' }] } },
        { id: 'n24', type: 'input', position_x: 1200, position_y: 1300, data: { type: 'input', question: '', saveAs: 'tipo_quadra', timeoutHours: 1 } },
        { id: 'n25', type: 'condition', position_x: 1200, position_y: 1450, data: { type: 'condition', branches: [
          { id: 'bt1', label: 'Interna', logic: 'AND', rules: [{ id: 'rt1', field: 'variable', fieldName: 'tipo_quadra', operator: 'contains', value: 'Interna' }] },
          { id: 'bt2', label: 'Externa', logic: 'AND', rules: [{ id: 'rt2', field: 'variable', fieldName: 'tipo_quadra', operator: 'contains', value: 'Externa' }] },
        ] } },

        // ── WEBHOOKS HORÁRIOS (lado a lado) ──
        { id: 'n26', type: 'webhook', position_x: 1000, position_y: 1650, data: { type: 'webhook', url: 'https://SEU-N8N.com/webhook/horarios', method: 'POST', body: '{"quadra": "interna", "phone": "{{phone}}"}', saveResponseAs: 'horarios_interna' } },
        { id: 'n27', type: 'send_message', position_x: 1000, position_y: 1800, data: { type: 'send_message', subtype: 'text', message: '📅 *Horários disponíveis*\n(Valores avulso)\nQUADRA INTERNA\n\n{{horarios_interna}}' } },
        { id: 'n28', type: 'webhook', position_x: 1400, position_y: 1650, data: { type: 'webhook', url: 'https://SEU-N8N.com/webhook/horarios', method: 'POST', body: '{"quadra": "externa", "phone": "{{phone}}"}', saveResponseAs: 'horarios_externa' } },
        { id: 'n29', type: 'send_message', position_x: 1400, position_y: 1800, data: { type: 'send_message', subtype: 'text', message: '📅 *Horários disponíveis*\n(Valores avulso)\nQUADRA EXTERNA\n\n{{horarios_externa}}' } },

        // ── AÇÕES PÓS HORÁRIOS (centralizado) ──
        { id: 'n30', type: 'send_message', position_x: 1200, position_y: 2000, data: { type: 'send_message', subtype: 'buttons', message: 'O que deseja fazer?', buttons: [{ title: 'Reservar horário' }, { title: 'Ver outra quadra' }, { title: 'Voltar ao menu' }] } },
        { id: 'n31', type: 'input', position_x: 1200, position_y: 2150, data: { type: 'input', question: '', saveAs: 'acao_horario', timeoutHours: 1 } },
        { id: 'n32', type: 'condition', position_x: 1200, position_y: 2300, data: { type: 'condition', branches: [
          { id: 'bh1', label: '✅ Reservar', logic: 'AND', rules: [{ id: 'rh1', field: 'variable', fieldName: 'acao_horario', operator: 'contains', value: 'Reservar' }] },
          { id: 'bh2', label: '🔄 Ver outra', logic: 'AND', rules: [{ id: 'rh2', field: 'variable', fieldName: 'acao_horario', operator: 'contains', value: 'outra' }] },
          { id: 'bh3', label: '↩️ Menu', logic: 'AND', rules: [{ id: 'rh3', field: 'variable', fieldName: 'acao_horario', operator: 'contains', value: 'menu' }] },
        ] } },

        // ── RESERVAR: DADOS + VALIDAÇÃO (centralizado embaixo) ──
        { id: 'n33', type: 'send_message', position_x: 1200, position_y: 2500, data: { type: 'send_message', subtype: 'text', message: 'Digite qual quadra, dia e horário:\n\n(ex: Quadra Interna, Segunda 14h)' } },
        { id: 'n34', type: 'input', position_x: 1200, position_y: 2650, data: { type: 'input', question: '', saveAs: 'reserva_dados', timeoutHours: 1 } },
        { id: 'n35', type: 'webhook', position_x: 1200, position_y: 2800, data: { type: 'webhook', url: 'https://SEU-N8N.com/webhook/validar-e-reservar', method: 'POST', body: '{"dados": "{{reserva_dados}}", "phone": "{{phone}}", "name": "{{name}}"}', saveResponseAs: 'resultado_reserva' } },
        { id: 'n36', type: 'condition', position_x: 1200, position_y: 2950, data: { type: 'condition', branches: [
          { id: 'bv1', label: '❌ Inválido', logic: 'AND', rules: [{ id: 'rv1', field: 'variable', fieldName: 'webhook_ok', operator: 'equals', value: 'false' }] },
        ] } },

        // Inválido (esquerda)
        { id: 'n37', type: 'send_message', position_x: 1000, position_y: 3100, data: { type: 'send_message', subtype: 'text', message: 'Opção inválida (horário reservado ou erro de digitação). Confira os horários disponíveis novamente.' } },

        // ── VÁLIDO: CONFIRMAÇÃO + PIX + NOTIFICA DONO (direita) ──
        { id: 'n38', type: 'send_message', position_x: 1400, position_y: 3100, data: { type: 'send_message', subtype: 'text', message: '✅ *Horário reservado com sucesso!*\n\n{{resultado_reserva}}\n\nPara confirmar, é necessário um PIX de R$ [valor].\n\nChave PIX: [sua chave]\n\nAguardamos o comprovante.' } },
        { id: 'n39', type: 'webhook', position_x: 1400, position_y: 3250, data: { type: 'webhook', url: 'https://SEU-N8N.com/webhook/notificar-dono', method: 'POST', body: '{"reserva": "{{resultado_reserva}}", "cliente_phone": "{{phone}}", "cliente_nome": "{{name}}", "dados": "{{reserva_dados}}"}', saveResponseAs: 'notif_dono' } },
        { id: 'n40', type: 'send_message', position_x: 1400, position_y: 3400, data: { type: 'send_message', subtype: 'text', message: 'Quando enviar o comprovante aqui, um atendente vai confirmar e finalizar sua reserva! 🚀' } },
        { id: 'n41', type: 'assign_agent', position_x: 1400, position_y: 3550, data: { type: 'assign_agent', agentId: 'round_robin', message: '📋 Nova reserva pendente de pagamento' } },
      ],
      edges: [
        // Menu principal
        { id: 'e1', source_node: 'n1', target_node: 'n2', source_handle: 'success' },
        { id: 'e2', source_node: 'n2', target_node: 'n3', source_handle: 'success' },
        { id: 'e3', source_node: 'n3', target_node: 'n4', source_handle: 'success' },
        // Fallback menu → "não entendi" → volta menu
        { id: 'ef1', source_node: 'n4', target_node: 'nf1', source_handle: 'fallback' },
        { id: 'ef1b', source_node: 'nf1', target_node: 'n2', source_handle: 'success' },

        // Outro Assunto
        { id: 'e4', source_node: 'n4', target_node: 'n5', source_handle: 'branch_b1' },
        { id: 'e5', source_node: 'n5', target_node: 'n6', source_handle: 'success' },
        { id: 'e6', source_node: 'n6', target_node: 'n7', source_handle: 'success' },
        { id: 'e7', source_node: 'n7', target_node: 'n8', source_handle: 'branch_bo1' },
        { id: 'e9', source_node: 'n7', target_node: 'n10', source_handle: 'branch_bo2' },
        { id: 'e11', source_node: 'n7', target_node: 'n12', source_handle: 'branch_bo3' },
        // Fallback outro assunto
        { id: 'ef2', source_node: 'n7', target_node: 'nf2', source_handle: 'fallback' },
        { id: 'ef2b', source_node: 'nf2', target_node: 'n5', source_handle: 'success' },
        // Infos → "Posso ajudar?"
        { id: 'e8', source_node: 'n8', target_node: 'na1', source_handle: 'success' },
        { id: 'e10', source_node: 'n10', target_node: 'na1', source_handle: 'success' },
        { id: 'e12', source_node: 'n12', target_node: 'na1', source_handle: 'success' },
        { id: 'ea1', source_node: 'na1', target_node: 'na2', source_handle: 'success' },
        { id: 'ea2', source_node: 'na2', target_node: 'na3', source_handle: 'success' },
        // Sim → volta menu | Não → encerra
        { id: 'ea3', source_node: 'na3', target_node: 'n2', source_handle: 'branch_ba1' },
        { id: 'ea4', source_node: 'na3', target_node: 'na4', source_handle: 'fallback' },
        { id: 'ea5', source_node: 'na4', target_node: 'na5', source_handle: 'success' },

        // Reservas
        { id: 'e13', source_node: 'n4', target_node: 'n14', source_handle: 'branch_b2' },
        { id: 'e14', source_node: 'n14', target_node: 'n15', source_handle: 'success' },
        { id: 'e15', source_node: 'n15', target_node: 'n16', source_handle: 'success' },
        { id: 'e16', source_node: 'n16', target_node: 'n17', source_handle: 'branch_br1' },
        { id: 'e17', source_node: 'n16', target_node: 'n18', source_handle: 'branch_br2' },
        // Fallback reservas
        { id: 'ef3', source_node: 'n16', target_node: 'nf3', source_handle: 'fallback' },
        { id: 'ef3b', source_node: 'nf3', target_node: 'n14', source_handle: 'success' },

        // Quadra
        { id: 'e18', source_node: 'n4', target_node: 'n19', source_handle: 'branch_b3' },
        { id: 'e19', source_node: 'n19', target_node: 'n20', source_handle: 'success' },
        { id: 'e20', source_node: 'n20', target_node: 'n21', source_handle: 'success' },
        { id: 'e21', source_node: 'n21', target_node: 'n22', source_handle: 'branch_bq2' },
        { id: 'e22', source_node: 'n21', target_node: 'n23', source_handle: 'branch_bq1' },
        // Fallback quadra
        { id: 'ef4', source_node: 'n21', target_node: 'nf4', source_handle: 'fallback' },
        { id: 'ef4b', source_node: 'nf4', target_node: 'n19', source_handle: 'success' },

        // Escolher quadra
        { id: 'e23', source_node: 'n23', target_node: 'n24', source_handle: 'success' },
        { id: 'e24', source_node: 'n24', target_node: 'n25', source_handle: 'success' },
        // Fallback tipo quadra → volta escolher
        { id: 'ef5', source_node: 'n25', target_node: 'n23', source_handle: 'fallback' },

        // Webhook horários
        { id: 'e25', source_node: 'n25', target_node: 'n26', source_handle: 'branch_bt1' },
        { id: 'e26', source_node: 'n26', target_node: 'n27', source_handle: 'success' },
        { id: 'e27', source_node: 'n27', target_node: 'n30', source_handle: 'success' },
        { id: 'e28', source_node: 'n25', target_node: 'n28', source_handle: 'branch_bt2' },
        { id: 'e29', source_node: 'n28', target_node: 'n29', source_handle: 'success' },
        { id: 'e30', source_node: 'n29', target_node: 'n30', source_handle: 'success' },

        // Ações após horários
        { id: 'e31', source_node: 'n30', target_node: 'n31', source_handle: 'success' },
        { id: 'e32', source_node: 'n31', target_node: 'n32', source_handle: 'success' },
        { id: 'e33', source_node: 'n32', target_node: 'n23', source_handle: 'branch_bh2' },
        { id: 'e34', source_node: 'n32', target_node: 'n33', source_handle: 'branch_bh1' },
        // Voltar ao menu
        { id: 'e33m', source_node: 'n32', target_node: 'n2', source_handle: 'branch_bh3' },
        // Fallback ações → volta
        { id: 'ef6', source_node: 'n32', target_node: 'n30', source_handle: 'fallback' },

        // Dados reserva → validar + reservar
        { id: 'e35', source_node: 'n33', target_node: 'n34', source_handle: 'success' },
        { id: 'e36', source_node: 'n34', target_node: 'n35', source_handle: 'success' },
        { id: 'e37', source_node: 'n35', target_node: 'n36', source_handle: 'success' },

        // Inválido → tenta de novo
        { id: 'e38', source_node: 'n36', target_node: 'n37', source_handle: 'branch_bv1' },
        { id: 'e39', source_node: 'n37', target_node: 'n30', source_handle: 'success' },

        // Válido → confirmação + PIX + notifica dono → atendente
        { id: 'e40', source_node: 'n36', target_node: 'n38', source_handle: 'fallback' },
        { id: 'e41', source_node: 'n38', target_node: 'n39', source_handle: 'success' },
        { id: 'e42', source_node: 'n39', target_node: 'n40', source_handle: 'success' },
        { id: 'e43', source_node: 'n40', target_node: 'n41', source_handle: 'success' },
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
  const [newCampaignId, setNewCampaignId] = useState('')
  const [newCooldown, setNewCooldown] = useState('24h')
  const [editingFlow, setEditingFlow] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editChannelId, setEditChannelId] = useState('')
  const [editCampaignId, setEditCampaignId] = useState('')
  const [editCooldown, setEditCooldown] = useState('24h')
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: async () => { const { data } = await messageApi.get('/flows'); return data.data || [] },
  })

  const { data: channels = [] } = useQuery({
    queryKey: ['channels'],
    queryFn: async () => { const { data } = await channelApi.get('/channels'); return data.data || [] },
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns-for-flows'],
    queryFn: async () => { const { data } = await campaignApi.get('/campaigns'); return data.data || [] },
  })

  const { data: limitsData } = useQuery({
    queryKey: ['limits'],
    queryFn: async () => { const { data } = await tenantApi.get('/tenant/limits'); return data.data },
    staleTime: 60000,
  })
  const flowLimitReached = limitsData?.limits?.flows !== null && limitsData?.limits?.flows !== undefined && (limitsData?.usage?.flows ?? 0) >= limitsData?.limits?.flows

  const FLOW_TEMPLATES = getFlowTemplates(t)
  const COOLDOWN_OPTIONS = getCooldownOptions(t)

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await messageApi.post('/flows', { name: newName, channelId: newChannelId || null, campaignId: newCampaignId || null, cooldown_type: newCooldown })
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
      await messageApi.patch(`/flows/${editingFlow.id}`, { name: editName, channelId: editChannelId || null, campaignId: editCampaignId || null, cooldown_type: editCooldown })
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
    setEditingFlow(f); setEditName(f.name); setEditChannelId(f.channel_id || ''); setEditCampaignId(f.campaign_id || ''); setEditCooldown(f.cooldown_type || '24h')
  }

  const duplicateFlow = async (flow: any, e: React.MouseEvent) => {
    e.stopPropagation()
    if (duplicatingId) return
    setDuplicatingId(flow.id)
    try {
      // 1. Create new flow with same settings
      const { data: newFlowRes } = await messageApi.post('/flows', {
        name: `${flow.name} (copia)`,
        channelId: flow.channel_id || null,
        campaignId: flow.campaign_id || null,
        cooldown_type: flow.cooldown_type || '24h',
      })
      const newFlow = newFlowRes.data
      // 2. Get original flow nodes/edges
      const { data: originalRes } = await messageApi.get(`/flows/${flow.id}`)
      const original = originalRes.data
      if (original.nodes && original.nodes.length > 0) {
        // 3. Remap IDs so they are unique
        const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const idMap: Record<string, string> = {}
        const nodes = original.nodes.map((n: any) => {
          const newId = uid()
          idMap[n.id] = newId
          return { id: newId, type: n.type, position_x: n.position_x, position_y: n.position_y, data: n.data || {} }
        })
        const edges = (original.edges || []).map((edge: any) => ({
          id: uid(),
          source_node: idMap[edge.source_node] || edge.source_node,
          target_node: idMap[edge.target_node] || edge.target_node,
          source_handle: edge.source_handle || null,
        }))
        // 4. Save graph to new flow
        await messageApi.put(`/flows/${newFlow.id}/graph`, { nodes, edges })
      }
      toast.success(`Flow "${flow.name}" duplicado!`)
      queryClient.invalidateQueries({ queryKey: ['flows'] })
    } catch {
      toast.error('Erro ao duplicar flow')
    } finally {
      setDuplicatingId(null)
    }
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
        <div className="mobile-header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {flowLimitReached && (
            <span style={{ fontSize: '12px', color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '6px 12px', fontWeight: 600 }}>
              Limite de flows atingido.<a href="/dashboard/settings#planos" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'underline', marginLeft: '4px' }}>Fazer upgrade</a>
            </span>
          )}
          {canEdit('/dashboard/flows') && !flowLimitReached && (
          <button onClick={() => setShowTemplates(true)}
            style={{ padding: '9px 16px', background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Copy size={14} /> {t('flows.templates')}
          </button>
          )}
          {canEdit('/dashboard/flows') && !flowLimitReached && (
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
            <div>
              <label style={labelStyle}>Campanha (opcional)</label>
              <select style={{ ...inputStyle }} value={newCampaignId} onChange={e => setNewCampaignId(e.target.value)}>
                <option value="">Todas as campanhas</option>
                {campaigns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                <label style={labelStyle}>Campanha (opcional)</label>
                <select style={{ ...inputStyle }} value={editCampaignId} onChange={e => setEditCampaignId(e.target.value)}>
                  <option value="">Todas as campanhas</option>
                  {campaigns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                {canEdit('/dashboard/flows') && !flowLimitReached && (
                <button onClick={e => duplicateFlow(f, e)} disabled={duplicatingId === f.id} title="Duplicar flow"
                  style={{ background: 'none', border: 'none', cursor: duplicatingId === f.id ? 'not-allowed' : 'pointer', padding: '5px', display: 'flex', color: 'var(--text-faint)', borderRadius: '6px', opacity: duplicatingId === f.id ? 0.5 : 1 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f5f3ff'; (e.currentTarget as HTMLButtonElement).style.color = '#7c3aed' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}>
                  {duplicatingId === f.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={14} />}
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
