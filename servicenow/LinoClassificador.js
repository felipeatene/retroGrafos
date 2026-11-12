function LinoClassificador() {}

LinoClassificador.prototype = {
    tipos: {
        sistema: 'Sistema', modulo: 'Módulo', servico: 'Serviço', local: 'Local',
        pessoa: 'Pessoa', equipe: 'Equipe', data: 'Data', dia: 'Dia',
        identificador: 'Identificador', termo: 'Termo'
    },

    campos: {
        u_system_name: 'sistema', u_system_module: 'modulo', business_service: 'servico',
        service_offering: 'servico', cmdb_ci: 'sistema', location: 'local', caller_id: 'pessoa',
        assigned_to: 'pessoa', assignment_group: 'equipe', problem_id: 'identificador',
        caused_by: 'identificador', rfc: 'identificador', parent: 'identificador'
    },

    camposDeRegra: ('short_description description category subcategory business_service service_offering cmdb_ci ' +
        'close_notes close_code resolution_notes cause_notes fix_notes workaround work_notes implementation_plan ' +
        'justification risk_impact_analysis backout_plan test_plan u_system_name u_system_module u_sintoma ' +
        'state impact urgency priority problem_id caused_by rfc parent location caller_id assigned_to assignment_group').split(' '),

    comuns: ('a à ao aos as às o os um uma uns umas de da das do dos e é em na nas no nos para por com sem ou ' +
        'que se seu sua seus suas este esta isso esse essa isto ele ela eles elas como mais menos muito também ' +
        'já não sim foi ser são tem houve pelo pela pelos pelas sobre entre até durante após antes quando ' +
        'qual quais onde cada caso chamado incidente demo informação informações através segue').split(' '),

    normalizar: function (valor) {
        var texto = String(valor || '').toLowerCase();
        if (typeof texto.normalize === 'function') texto = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        else texto = texto.replace(/[áàãâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
            .replace(/[óòõôö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n');
        return texto.replace(/[^a-z0-9]+/g, ' ').trim();
    },

    validarRegras: function (regras) {
        if (!Array.isArray(regras) || regras.length > 500) return false;
        var campos = this.camposDeRegra;
        var motor = this;
        return regras.every(function (regra) {
            return regra && typeof regra.Title === 'string' && /^[a-z0-9_]{1,80}$/.test(regra.Title) &&
                (regra.Rotulo === undefined || typeof regra.Rotulo === 'string' && regra.Rotulo.length <= 160 &&
                    Boolean(motor.normalizar(regra.Rotulo))) &&
                Array.isArray(regra.PalavrasChave) && regra.PalavrasChave.length > 0 && regra.PalavrasChave.length <= 40 &&
                regra.PalavrasChave.every(function (termo) { return typeof termo === 'string' && termo.length <= 160; }) &&
                Array.isArray(regra.Campos) && regra.Campos.length > 0 && regra.Campos.length <= campos.length &&
                regra.Campos.every(function (campo) { return campos.indexOf(campo) !== -1; }) &&
                Array.isArray(regra.TiposTarefa) && regra.TiposTarefa.length > 0 && regra.TiposTarefa.length <= 3 &&
                regra.TiposTarefa.every(function (tipo) { return ['incident', 'problem', 'change_request'].indexOf(tipo) !== -1; }) &&
                typeof regra.Ativa === 'boolean';
        });
    },

    classificar: function (campos, data, regras, ignorados) {
        var motor = this;
        var tags = Object.create(null);
        var comuns = Object.create(null);
        var ignorar = Object.create(null);
        var resultado = [];
        this.comuns.forEach(function (valor) { comuns[motor.normalizar(valor)] = true; });
        ignorados.forEach(function (chave) { ignorar[chave] = true; });

        function incluir(tipo, valor, campo) {
            valor = String(valor || '').replace(/\s+/g, ' ').trim();
            var normalizado = motor.normalizar(valor);
            var chave = tipo + ':' + normalizado;
            if (!normalizado || valor.length > 160 || comuns[normalizado] || ignorar[chave]) return;
            var tag = tags[chave];
            if (!tag) {
                tag = {chave: chave, tipo: tipo, valor: valor, fontes: []};
                tags[chave] = tag;
                resultado.push(tag);
            }
            if (tag.fontes.indexOf(campo) === -1) tag.fontes.push(campo);
        }

        Object.keys(this.campos).forEach(function (campo) { incluir(motor.campos[campo], campos[campo], campo); });
        if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            incluir('data', data.slice(8) + '/' + data.slice(5, 7) + '/' + data.slice(0, 4), 'opened_at');
            incluir('dia', 'Dia ' + Number(data.slice(8)), 'opened_at');
        }

        ['short_description', 'description'].forEach(function (campo) {
            var texto = String(campos[campo] || '');
            var contextos = /(?:^|[.\n;])\s*(sistema|m[oó]dulo|servi[cç]o|local|equipe|respons[aá]vel|solicitante)\s*:\s*([^.;\r\n]{1,120})(?=[.;\r\n]|$)/gi;
            var nomes = {sistema: 'sistema', modulo: 'modulo', servico: 'servico', local: 'local',
                equipe: 'equipe', responsavel: 'pessoa', solicitante: 'pessoa'};
            var contexto;
            while ((contexto = contextos.exec(texto))) incluir(nomes[motor.normalizar(contexto[1])], contexto[2], campo);
            var ids = /\b(?:DEMO[- ](?:INC|PRB|CHG)[- ][A-Z0-9-]+|(?:INC|PRB|CHG|REQ|RITM|TASK)\d{4,})\b/gi;
            var id;
            while ((id = ids.exec(texto))) incluir('identificador', id[0], campo);
            // Capture words after recognized IDs and addresses have been separated from ordinary vocabulary.
            var palavras = texto.replace(ids, ' ').replace(/https?:\/\/\S+|[^\s@]+@[^\s@]+/gi, ' ')
                .match(/[a-záàãâäéèêëíìîïóòõôöúùûüçñ]{3,}/gi) || [];
            palavras.forEach(function (palavra) { incluir('termo', palavra, campo); });
        });

        regras.forEach(function (regra) {
            if (!regra.Ativa || regra.TiposTarefa.indexOf('incident') === -1) return;
            regra.Campos.forEach(function (campo) {
                var texto = ' ' + motor.normalizar(campos[campo]) + ' ';
                regra.PalavrasChave.forEach(function (termo) {
                    var normalizado = motor.normalizar(termo);
                    if (!normalizado || comuns[normalizado] || ignorar['termo:' + normalizado] ||
                        texto.indexOf(' ' + normalizado + ' ') === -1) return;
                    incluir('termo', regra.Rotulo || regra.Title.replace(/_+/g, ' '), campo);
                    incluir('termo', termo, campo);
                });
            });
        });
        return resultado;
    },

    type: 'LinoClassificador'
};
