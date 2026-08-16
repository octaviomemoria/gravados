-- SEARCH-001 (Fase 7 - Knowledge, "Full-text search local", 07_AI_TRANSCRIPTION_KNOWLEDGE.md §10
-- Fase 1). Migration ESCRITA A MAO, nao gerada por `drizzle-kit generate` - o Drizzle nao modela
-- tabelas virtuais FTS5 no schema TypeScript (`main/database/schema/*.ts`), entao esta tabela e
-- os tres gatilhos abaixo nunca aparecem la, so aqui. Decisao registrada no README ("Decisoes de
-- arquitetura") - continua "versionada e revisada" (a exigencia real do projeto pra mudar
-- schema), so nao "gerada".
--
-- `content='transcript_segments'` + `content_rowid='rowid'`: tabela FTS5 de "conteudo externo" -
-- o indice invertido guarda so os termos, nunca uma copia do texto (que ja vive em
-- `transcript_segments.text`); `rowid` e o rowid IMPLICITO da tabela real (toda tabela SQLite tem
-- um, mesmo com uma chave primaria TEXT declarada, a menos que seja WITHOUT ROWID) - a ponte entre
-- os dois lados de qualquer resultado de busca.
CREATE VIRTUAL TABLE `transcript_segments_fts` USING fts5(
	`text`,
	content=`transcript_segments`,
	content_rowid=`rowid`
);
--> statement-breakpoint
-- Os tres gatilhos abaixo mantêm o índice em sincronia automaticamente NO NÍVEL DO BANCO -
-- qualquer inserção/exclusão/atualização futura em `transcript_segments`, mesmo por um caminho de
-- código que um dia esqueça de atualizar o índice manualmente, nunca deixa o FTS desatualizado.
-- `transcript_segments` hoje só recebe INSERT (nunca UPDATE/DELETE, ver `TranscriptRepository`),
-- mas os três gatilhos existem pra correção, não só pro caminho usado agora.
CREATE TRIGGER `transcript_segments_ai` AFTER INSERT ON `transcript_segments` BEGIN
	INSERT INTO `transcript_segments_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `transcript_segments_ad` AFTER DELETE ON `transcript_segments` BEGIN
	INSERT INTO `transcript_segments_fts`(`transcript_segments_fts`, rowid, `text`) VALUES('delete', old.rowid, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER `transcript_segments_au` AFTER UPDATE ON `transcript_segments` BEGIN
	INSERT INTO `transcript_segments_fts`(`transcript_segments_fts`, rowid, `text`) VALUES('delete', old.rowid, old.`text`);
	INSERT INTO `transcript_segments_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
