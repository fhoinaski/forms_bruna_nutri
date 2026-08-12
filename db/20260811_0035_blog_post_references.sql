-- Agente de blog com escopo de saude ampliado (medicamentos, farmacoterapia
-- da obesidade/diabetes, exames, suplementos, condicoes clinicas) — ver
-- lib/ai/agents/content/blog-creation-agent.ts.
--
-- Aditivo: nenhuma coluna existente muda de tipo ou e removida. Posts
-- antigos continuam funcionando exatamente como hoje (references_json fica
-- '[]', content_domain fica NULL).
--
-- references_json: lista estruturada de fontes citadas pelo rascunho
-- (title/organization/url/year/accessed_at — ver blogReferenceSchema em
-- blog-creation-agent.ts). Mesmo padrao de tags_json (TEXT NOT NULL DEFAULT
-- '[]', serializado/desserializado na camada de repositorio). A IA nunca
-- inventa uma referencia: quando nao ha fonte confirmada, o array fica vazio.
ALTER TABLE blog_posts ADD COLUMN references_json TEXT NOT NULL DEFAULT '[]';

-- content_domain: classificacao editorial interna (nutrition/medication/
-- clinical_condition/supplement/maternal_child/behavior/general_health) —
-- usada para decidir profundidade de pesquisa e qual disclaimer anexar, e
-- exibida como badge no editor admin para a nutricionista revisar com mais
-- atencao rascunhos que tocam medicamento/condicao clinica antes de publicar.
-- Nula para posts criados antes desta mudanca ou fora do fluxo de IA.
ALTER TABLE blog_posts ADD COLUMN content_domain TEXT NULL
  CHECK (content_domain IS NULL OR content_domain IN (
    'nutrition', 'maternal_child', 'clinical_condition', 'medication',
    'supplement', 'behavior', 'general_health'
  ));
