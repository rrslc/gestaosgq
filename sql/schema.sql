-- ═══════════════════════════════════════════════════════════════════════════
-- SGQ — Schema Neon PostgreSQL
-- Execute uma vez no painel SQL do Neon Console
-- ═══════════════════════════════════════════════════════════════════════════

-- Tabela genérica para todos os registros do SGQ (JSONB flexível)
CREATE TABLE IF NOT EXISTS sgq_records (
  id          SERIAL PRIMARY KEY,
  collection  TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sgq_records_collection
  ON sgq_records (collection);

-- Configuração da empresa (chave-valor)
CREATE TABLE IF NOT EXISTS sgq_config (
  key    TEXT  PRIMARY KEY,
  value  JSONB NOT NULL DEFAULT '{}'
);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sgq_records_updated_at
BEFORE UPDATE ON sgq_records
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Dados iniciais de configuração
INSERT INTO sgq_config (key, value)
VALUES ('empresa', '{"empresa":"","cnpj":"","afe":"","classes":"Classe I, II, III e IV","obs":""}')
ON CONFLICT (key) DO NOTHING;
