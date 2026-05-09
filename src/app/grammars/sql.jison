%{
// Variables globales a nivel de IIFE (antes de %lex)
var _tokens       = [];
var _lexErrors    = [];
var _syntaxErrors = [];
var _ast          = null;

function _reset() {
  _tokens       = [];
  _lexErrors    = [];
  _syntaxErrors = [];
  _ast          = null;
}

function addTok(type, value, line, col) {
  _tokens.push({ type: type, value: String(value), line: line, col: col });
}

function addLexErr(lexeme, line, col, desc) {
  _lexErrors.push({
    lexeme:      lexeme,
    line:        line,
    col:         col,
    type:        'Lexico',
    description: desc
  });
}

function addSynErr(lexeme, line, col, desc) {
  _syntaxErrors.push({
    lexeme:      lexeme,
    line:        line,
    col:         col,
    type:        'Sintactico',
    description: desc
  });
}
%}

%lex

ID    [a-zA-Z_][a-zA-Z0-9_]*
DIGIT [0-9]
INT   {DIGIT}+
FLOAT {DIGIT}+\.{DIGIT}+
WS    [ \t\r]+

%%

{WS}                              { /* ignorar */ }
\n                                { /* ignorar */ }
"`"[^`]*"`"                       { /* ignorar backtick wrapper completo */ }
"`"                               { /* ignorar backtick individual */ }
"--"[^\n]*                        { /* comentario SQL */ }
"/*"([^*]|("*"[^/]))*"*/"        { /* comentario bloque */ }

{FLOAT}   { addTok('NUMBER', yytext, yylineno+1, yylloc.first_column+1); return 'NUMBER'; }
{INT}     { addTok('NUMBER', yytext, yylineno+1, yylloc.first_column+1); return 'NUMBER'; }

\"([^\"\\]|\\.)*\"   { addTok('STRING', yytext, yylineno+1, yylloc.first_column+1); return 'STRING'; }
\'([^\'\\]|\\.)*\'   { addTok('STRING', yytext, yylineno+1, yylloc.first_column+1); return 'STRING'; }

"true"  { addTok('BOOL', yytext, yylineno+1, yylloc.first_column+1); return 'BOOL'; }
"false" { addTok('BOOL', yytext, yylineno+1, yylloc.first_column+1); return 'BOOL'; }

"TABLE"    { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_TABLE'; }
"COLUMNS"  { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_COLUMNS'; }
"DELETE"   { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_DELETE'; }
"IN"       { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_IN'; }
"int"      { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_TYPE_INT'; }
"float"    { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_TYPE_FLOAT'; }
"string"   { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_TYPE_STRING'; }
"boolean"  { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_TYPE_BOOL'; }
"char"     { addTok('KEYWORD', yytext, yylineno+1, yylloc.first_column+1); return 'KW_TYPE_CHAR'; }

{ID}   { addTok('IDENTIFIER', yytext, yylineno+1, yylloc.first_column+1); return 'IDENT'; }

"["   { addTok('SYMBOL', yytext, yylineno+1, yylloc.first_column+1); return 'LBRACK'; }
"]"   { addTok('SYMBOL', yytext, yylineno+1, yylloc.first_column+1); return 'RBRACK'; }
"="   { addTok('SYMBOL', yytext, yylineno+1, yylloc.first_column+1); return 'EQ';     }
","   { addTok('SYMBOL', yytext, yylineno+1, yylloc.first_column+1); return 'COMMA';  }
"."   { addTok('SYMBOL', yytext, yylineno+1, yylloc.first_column+1); return 'DOT';    }
";"   { addTok('SYMBOL', yytext, yylineno+1, yylloc.first_column+1); return 'SEMI';   }
"-"   { addTok('SYMBOL', yytext, yylineno+1, yylloc.first_column+1); return 'MINUS';  }

.      {
  addLexErr(yytext, yylineno+1, yylloc.first_column+1,
            'Simbolo no reconocido en SQL: "' + yytext + '"');
}

/lex

%start program

%%

program
  : stmt_list
      { _ast = $1; }
  ;

stmt_list
  : /* vacio */    { $$ = []; }
  | stmt_list stmt { $$ = $1.concat([$2]); }
  ;

stmt
  : create_stmt opt_semi   { $$ = $1; }
  | select_stmt opt_semi   { $$ = $1; }
  | insert_stmt opt_semi   { $$ = $1; }
  | update_stmt opt_semi   { $$ = $1; }
  | delete_stmt opt_semi   { $$ = $1; }
  ;

opt_semi
  : /* vacio */
  | SEMI
  ;

create_stmt
  : KW_TABLE IDENT KW_COLUMNS col_def_list
      { $$ = { type: 'CREATE', table: $2, columns: $4 }; }
  ;

col_def_list
  : col_def                { $$ = [$1]; }
  | col_def_list COMMA col_def { $$ = $1.concat([$3]); }
  ;

col_def
  : IDENT EQ data_type     { $$ = { name: $1, dataType: $3 }; }
  ;

data_type
  : KW_TYPE_INT     { $$ = 'int'; }
  | KW_TYPE_FLOAT   { $$ = 'float'; }
  | KW_TYPE_STRING  { $$ = 'string'; }
  | KW_TYPE_BOOL    { $$ = 'boolean'; }
  | KW_TYPE_CHAR    { $$ = 'char'; }
  ;

select_stmt
  : IDENT DOT IDENT        { $$ = { type: 'SELECT', table: $1, column: $3 }; }
  ;

insert_stmt
  : IDENT LBRACK assign_list RBRACK   { $$ = { type: 'INSERT', table: $1, values: $3 }; }
  ;

update_stmt
  : IDENT LBRACK assign_list RBRACK KW_IN NUMBER
      { $$ = { type: 'UPDATE', table: $1, values: $3, id: Number($6) }; }
  ;

delete_stmt
  : IDENT KW_DELETE NUMBER   { $$ = { type: 'DELETE', table: $1, id: Number($3) }; }
  ;

assign_list
  : assignment                { $$ = [$1]; }
  | assign_list COMMA assignment { $$ = $1.concat([$3]); }
  ;

assignment
  : IDENT EQ scalar          { $$ = { col: $1, value: $3 }; }
  ;

scalar
  : NUMBER          { $$ = Number($1); }
  | MINUS NUMBER    { $$ = -Number($2); }
  | STRING          { $$ = String($1).replace(/^["']|["']$/g, ''); }
  | BOOL            { $$ = ($1 === 'true') ? 1 : 0; }
  ;

%%

/* ========== EPÍLOGO CORREGIDO ========== */
if (typeof module !== 'undefined' && module.exports) {
  // Wrap en función para ejecutarse DESPUÉS de que parser esté definido
  var _setupParser = function() {
    if (!parser.yy) parser.yy = {};

    parser.yy.parseError = function(msg, hash) {
      var lex  = (hash && hash.text) ? hash.text                 : 'EOF';
      var line = (hash && hash.loc)  ? hash.loc.first_line       : 0;
      var col  = (hash && hash.loc)  ? hash.loc.first_column + 1 : 0;
      var desc = msg;
      if (hash && hash.expected && hash.expected.length > 0) {
        desc = 'Se encontró "' + lex + '" pero se esperaba: ' +
               hash.expected.map(function(t){ return '"' + t + '"'; }).join(', ');
      }
      addSynErr(lex, line, col, desc);
      throw new Error(desc);
    };
  };

  exports.parse = function(input) {
    _reset();
    _setupParser();
    try {
      parser.parse(input);
    } catch(e) {
      // error ya registrado en parseError
    }
    var ok = (_lexErrors.length === 0 && _syntaxErrors.length === 0);
    return {
      ok:           ok,
      ast:          _ast || [],
      tokens:       _tokens,
      lexErrors:    _lexErrors,
      syntaxErrors: _syntaxErrors
    };
  };

  exports.getResults = function() {
    return {
      ok:           (_lexErrors.length === 0 && _syntaxErrors.length === 0),
      ast:          _ast || [],
      tokens:       _tokens,
      lexErrors:    _lexErrors,
      syntaxErrors: _syntaxErrors
    };
  };

  // Exponer métodos en el parser para acceso directo
  parser._reset = _reset;
  parser._getTokens = function() { return _tokens; };
  parser._getLexicalErrors = function() { return _lexErrors; };
  parser._getSyntaxErrors = function() { return _syntaxErrors; };
  parser._getAST = function() { return _ast; };
}
