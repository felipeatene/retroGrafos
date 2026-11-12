function LinoService() {
    this.usuario = String(gs.getUserID() || '');
    var grupo = String(gs.getProperty('lino.group_id', '') || '');
    var proprietario = String(gs.getProperty('lino.tag_owner_id', '') || '');
    var usaGrupo = this.idValido(this.usuario) && this.idValido(grupo) && this.idValido(proprietario) &&
        gs.getUser().isMemberOf(grupo);
    this.grupo = usaGrupo ? grupo : '';
    this.proprietario = usaGrupo ? proprietario : this.usuario;
    this.audiencia = usaGrupo ? 'groups and users' : 'me';
    this.motor = new LinoClassificador();
    this.digest = new GlideDigest();
    this.marca = 'Lino v1:';
    this.fontes = this.motor.camposDeRegra.concat(['opened_at']);
}

LinoService.prototype = {
    idValido: function (id) { return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id); },

    registro: function (tabela, id) {
        var registro = new GlideRecordSecure(tabela);
        return registro.get(id) && registro.canRead() ? registro : null;
    },

    novo: function (tabela, campos) {
        var registro = new GlideRecordSecure(tabela);
        registro.initialize();
        Object.keys(campos).forEach(function (campo) { registro.setValue(campo, campos[campo]); });
        return registro;
    },

    podeCriar: function (registro, campos) {
        return registro.canCreate() && Object.keys(campos).every(function (campo) {
            // GlideElement can coerce to false when its field contains an empty or false value.
            return registro.isValidField(campo) && registro.getElement(campo).canCreate();
        });
    },

    valor: function (registro, campo) {
        if (!registro.isValidField(campo)) return '';
        return registro.getElement(campo).canRead() ? (registro.getValue(campo) || '') : '';
    },

    contexto: function (registro, campo) {
        var valor = this.valor(registro, campo);
        if (!valor) return '';
        var elemento = registro.getElement(campo);
        if (String(elemento.getED().getInternalType()) !== 'reference') return String(elemento.getDisplayValue() || valor);
        var referencia = this.registro(elemento.getReferenceTable(), valor);
        if (!referencia) return '';
        var chaves = ['number', 'name', 'user_name'];
        for (var i = 0; i < chaves.length; i++) {
            var nome = this.valor(referencia, chaves[i]);
            if (nome) return nome;
        }
        return '';
    },

    acesso: function (request) {
        if (!this.idValido(this.usuario) || gs.getUserName() === 'guest') return 401;
        var esperado = request.getHeader('X-Lino-User');
        if (esperado && esperado !== this.usuario) return 401;
        var tag = this.valoresTag('Lino', '');
        return this.podeCriar(this.novo('label', tag), tag) ? 200 : 403;
    },

    hash: function (valor) { return String(this.digest.getSHA256Hex(valor)).slice(0, 32); },
    idTag: function (chave) { return this.hash(this.marca + (this.grupo || this.usuario) + ':tag:' + chave); },
    idVinculo: function (tag, incidente) { return this.hash(this.marca + ':link:' + tag + ':' + incidente); },

    valoresTag: function (nome, descricao) {
        var campos = {name: nome, short_description: descricao, type: 'standard', active: 'true',
            viewable_by: this.audiencia, global: 'false', owner: this.proprietario};
        if (this.grupo) {
            campos.group_list = this.grupo;
            campos.user_list = '';
        }
        return campos;
    },

    valoresVinculo: function (tag, incidente, nome, comentarios) {
        return {label: tag, table: 'incident', table_key: incidente, title: nome, comments: comentarios,
            read: 'yes', url: 'incident.do?sys_id=' + incidente + '&sysparm_view='};
    },

    lerTag: function (id) {
        var tag = this.registro('label', id);
        if (!tag || this.valor(tag, 'viewable_by') !== this.audiencia ||
            ['0', 'false'].indexOf(this.valor(tag, 'global')) === -1 ||
            this.valor(tag, 'owner') !== this.proprietario || this.valor(tag, 'type') !== 'standard' ||
            ['1', 'true'].indexOf(this.valor(tag, 'active')) === -1) return null;
        if (this.grupo && (this.valor(tag, 'group_list') !== this.grupo ||
            !tag.getElement('user_list').canRead() || tag.getValue('user_list'))) return null;
        var meta = this.valor(tag, 'short_description');
        if (meta.indexOf(this.marca) !== 0) return null;
        try {
            var dados = JSON.parse(meta.slice(this.marca.length));
            var chave = dados.tipo + ':' + this.motor.normalizar(dados.valor);
            if (!Object.prototype.hasOwnProperty.call(this.motor.tipos, dados.tipo) || typeof dados.valor !== 'string' ||
                this.idTag(chave) !== id) return null;
            return {id: id, chave: chave, tipo: dados.tipo, valor: dados.valor, nome: this.valor(tag, 'name')};
        } catch (erro) { return null; }
    },

    inserir: function (tabela, id, campos) {
        var registro = this.novo(tabela, campos);
        if (!this.podeCriar(registro, campos)) return false;
        registro.setNewGuidValue(id);
        try { return String(registro.insert() || '') === id; }
        catch (erro) { return false; }
    },

    garantirTag: function (tag) {
        var id = this.idTag(tag.chave);
        var atual = this.lerTag(id);
        if (atual) return atual;
        var texto = tag.valor.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ0-9 ]/g, ' ').replace(/ +/g, ' ').trim();
        var nome = 'Lino ' + this.motor.tipos[tag.tipo] + ' ' + texto.slice(0, 48).trim() + ' ' + id.slice(0, 8);
        var meta = this.marca + JSON.stringify({tipo: tag.tipo, valor: tag.valor});
        this.inserir('label', id, this.valoresTag(nome, meta));
        // A concurrent insert can win. Read and verify the actual audience before linking.
        return this.lerTag(id);
    },

    vinculoExistente: function (tag, incidente) {
        var vinculo = new GlideRecordSecure('label_entry');
        vinculo.addQuery('table', 'incident');
        vinculo.addQuery('table_key', incidente);
        vinculo.addQuery('label', tag);
        vinculo.setLimit(1);
        vinculo.query();
        return vinculo.next() && vinculo.canRead();
    },

    aplicar: function (incidente, sugestao) {
        var tag = this.garantirTag(sugestao);
        if (!tag) return 'falha';
        if (this.vinculoExistente(tag.id, incidente)) return 'existente';
        var fontes = this.fontes;
        var comentarios = this.marca + sugestao.fontes.map(function (campo) { return fontes.indexOf(campo); }).join(',');
        var id = this.idVinculo(tag.id, incidente);
        if (!this.inserir('label_entry', id, this.valoresVinculo(tag.id, incidente, tag.nome, comentarios))) {
            return this.vinculoExistente(tag.id, incidente) ? 'existente' : 'falha';
        }
        var gravado = this.registro('label_entry', id);
        return gravado && this.valor(gravado, 'label') === tag.id && this.valor(gravado, 'comments') === comentarios
            ? 'adicionada' : 'falha';
    },

    diaLocal: function (utc) {
        if (!utc) return '';
        var data = new GlideDateTime(utc);
        var fuso = gs.getProperty('glide.sys.default.tz', 'UTC') || 'UTC';
        data.setTZ(Packages.java.util.TimeZone.getTimeZone(fuso));
        return String(data.getLocalDate().getValue());
    },

    classificar: function (ids, regras, ignorados) {
        var servico = this;
        var ler = ['short_description', 'description'].concat(Object.keys(this.motor.campos));
        regras.forEach(function (regra) {
            if (regra.Ativa && regra.TiposTarefa.indexOf('incident') !== -1) ler = ler.concat(regra.Campos);
        });
        return ids.map(function (id) {
            try {
                var incidente = servico.registro('incident', id);
                if (!incidente || !incidente.canWrite()) return {id: id, estado: 'sem_acesso'};
                var campos = {};
                ler.forEach(function (campo) {
                    if (!Object.prototype.hasOwnProperty.call(campos, campo)) campos[campo] = servico.contexto(incidente, campo);
                });
                var data = servico.diaLocal(servico.valor(incidente, 'opened_at'));
                var tags = servico.motor.classificar(campos, data, regras, ignorados).map(function (tag) {
                    try { tag.estado = servico.aplicar(id, tag); }
                    catch (erro) { tag.estado = 'falha'; }
                    return tag;
                });
                return {id: id, numero: servico.valor(incidente, 'number'), estado: 'analisado', tags: tags};
            } catch (erro) { return {id: id, estado: 'falha'}; }
        });
    },

    lerVinculo: function (vinculo, tag) {
        var id = vinculo.getUniqueValue();
        var incidenteId = this.valor(vinculo, 'table_key');
        var comentarios = this.valor(vinculo, 'comments');
        if (this.valor(vinculo, 'table') !== 'incident' || this.valor(vinculo, 'label') !== tag.id ||
            !this.idValido(incidenteId) || id !== this.idVinculo(tag.id, incidenteId) ||
            comentarios.indexOf(this.marca) !== 0) return null;
        var fonte = comentarios.slice(this.marca.length);
        if (!/^\d+(?:,\d+)*$/.test(fonte)) return null;
        var incidente = this.registro('incident', incidenteId);
        if (!incidente) return null;
        var servico = this;
        var campos = fonte.split(',').map(function (i) { return servico.fontes[Number(i)]; }).filter(function (campo) {
            if (!campo || !incidente.isValidField(campo) || !incidente.getElement(campo).canRead()) return false;
            var elemento = incidente.getElement(campo);
            return String(elemento.getED().getInternalType()) !== 'reference' || Boolean(servico.contexto(incidente, campo));
        });
        if (!campos.length) return null;
        return {id: id, tag: tag, incidente: {id: incidenteId, numero: this.valor(incidente, 'number'),
            titulo: this.valor(incidente, 'short_description'),
            campos: {grupo: this.contexto(incidente, 'assignment_group'), prioridade: this.contexto(incidente, 'priority'),
                estado: this.contexto(incidente, 'state'), categoria: this.contexto(incidente, 'category'),
                ic: this.contexto(incidente, 'cmdb_ci')},
            abertoEm: this.valor(incidente, 'opened_at')}, fontes: campos,
            removivel: incidente.canWrite() && vinculo.canDelete()};
    },

    pagina: function (cursor, tagId) {
        var vinculo = new GlideRecordSecure('label_entry');
        vinculo.addQuery('table', 'incident');
        vinculo.addQuery('comments', 'STARTSWITH', this.marca);
        if (cursor) vinculo.addQuery('sys_id', '>', cursor);
        if (tagId) vinculo.addQuery('label', tagId);
        vinculo.orderBy('sys_id');
        vinculo.query();
        var tags = Object.create(null);
        var itens = [];
        while (vinculo.next()) {
            var id = this.valor(vinculo, 'label');
            if (!this.idValido(id)) continue;
            if (!(id in tags)) tags[id] = this.lerTag(id);
            var item = tags[id] && this.lerVinculo(vinculo, tags[id]);
            if (!item || tagId && !item.removivel) continue;
            if (itens.length === 100) return {itens: itens, proximo: itens[99].id};
            itens.push(tagId ? {id: item.id} : item);
        }
        return {itens: itens, proximo: null};
    },

    remover: function (tagId, ids) {
        var tag = this.lerTag(tagId);
        var servico = this;
        return ids.map(function (id) {
            var vinculo = tag && servico.registro('label_entry', id);
            var item = vinculo && servico.lerVinculo(vinculo, tag);
            if (!vinculo) return {id: id, estado: 'indisponivel'};
            if (!item || !item.removivel) return {id: id, estado: 'sem_acesso'};
            var removido;
            try { removido = vinculo.deleteRecord(); }
            catch (erro) { removido = false; }
            return {id: id, incidente: item.incidente, estado: removido ? 'removido' : 'falha'};
        });
    },

    type: 'LinoService'
};
