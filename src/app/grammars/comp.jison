%{
var _tokens       = [];
var _lexErrors    = [];
var _syntaxErrors = [];
var _ast          = null;

var _components    = {};
var _currentParams = {};
var _inputIds      = [];
var _declaredStyles= {};
var _declaredFns   = {};

function addTok(type, value, line, col) {
  _tokens.push({ type: type, value: String(value), line: line, col: col });
}
function addLexErr(lexeme, line, col, desc) {
  _lexErrors.push({ lexeme: lexeme, line: line, col: col,
                    type: 'Lexico', description: desc });
}
function addSynErr(lexeme, line, col, desc) {
  _syntaxErrors.push({ lexeme: lexeme, line: line, col: col,
                       type: 'Sintactico', description: desc });
}
function addSemErr(lexeme, line, col, desc) {
  _syntaxErrors.push({ lexeme: lexeme, line: line, col: col,
                       type: 'Semantico', description: desc });
}

function enterComponent(name, params, line, col) {
  if (_components[name]) {
    addSemErr(name, line, col,
      'El componente "' + name + '" ya fue declarado (primera vez en linea ' +
      _components[name].line + ')');
  }
  _components[name] = { params: params, line: line, col: col };
  _currentParams = {};
  _inputIds = [];
  _declaredFns = {};
  (params || []).forEach(function(p) {
    var key = (p.name || '').replace(/^\$/, '');
    _currentParams[key] = p.paramType;
    if (p.paramType === 'function') {
      _declaredFns[key] = true;
    }
  });
}

function checkVarDeclared(varName, line, col) {
  // Validación desactivada en Fase 3.
  // Las variables $var pueden venir del .y que importa este .comp.
  // La validación real se hará en Fase 4 con el contexto del .y.
  return;
}

function registerInputId(rawId) {
  var id = String(rawId).replace(/^"|"$/g,'').replace(/^'|'$/g,'');
  if (_inputIds.indexOf(id) < 0) { _inputIds.push(id); }
}

function registerInputProps(props) {
  (props || []).forEach(function(p) {
    if (p.key === 'id' && p.value && p.value.value) {
      registerInputId(p.value.value);
    }
  });
}

function checkAtRef(atName, line, col) {
  var id = atName.replace(/^@/, '');
  if (_inputIds.indexOf(id) < 0) {
    addSemErr(atName, line, col,
      'Referencia "@' + id + '" no corresponde a ningun INPUT declarado en este FORM');
  }
}

function checkStyleRef(styleList, line, col) {
  if (Object.keys(_declaredStyles).length === 0) return;
  (styleList || []).forEach(function(s) {
    if (s && !_declaredStyles[s]) {
      addSemErr(s, line, col,
        'El estilo "' + s + '" no fue encontrado en los archivos .styles importados');
    }
  });
}

function checkFnRef(fnVarName, line, col) {
  var key = fnVarName.replace(/^\$/, '');
  if (!_declaredFns[key]) {
    addSemErr(fnVarName, line, col,
      'La funcion "' + fnVarName + '" no fue declarada como parametro de tipo function');
  }
}

function _reset() {
  _tokens        = [];
  _lexErrors     = [];
  _syntaxErrors  = [];
  _ast           = null;
  _components    = {};
  _currentParams = {};
  _inputIds      = [];
  _declaredStyles= {};
  _declaredFns   = {};
}

function _results() {
  return {
    tokens:       _tokens,
    lexErrors:    _lexErrors,
    syntaxErrors: _syntaxErrors,
    ast:          _ast
  };
}
%}

%lex

/* Macros lexicos */
ID      [a-zA-Z_][a-zA-Z0-9_\-]*
DIGIT   [0-9]
HEX     0[xX][0-9a-fA-F]+
FLOAT   {DIGIT}+\.{DIGIT}+
INT     {DIGIT}+
WS      [ \t\r]+

%%

/*  COMENTARIOS (gris)  */
"/*"[^*]*\*+([^/*][^*]*\*+)*"/"
    { addTok('COMMENT', yytext, yylineno+1, yylloc.first_column+1); }

"//"[^\n]*
    { addTok('COMMENT', yytext, yylineno+1, yylloc.first_column+1); }

/*  KEYWORDS — orden: mas largos primero para evitar prefijos  */
"INPUT_NUMBER" { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_INPUT_NUMBER'; }
"INPUT_BOOL"   { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_INPUT_BOOL'; }
"INPUT_TEXT"   { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_INPUT_TEXT'; }
"SUBMIT"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_SUBMIT'; }
"FORM"         { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_FORM'; }
"IMG"          { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_IMG'; }
"T"            { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_T'; }
"extends"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_EXTENDS'; }
"function"     { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_FUNCTION'; }
"boolean"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_BOOLEAN'; }
"return"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_RETURN'; }
"string"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_STRING'; }
"default"      { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_DEFAULT'; }
"Switch"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_SWITCH'; }
"switch"       { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_SWITCH'; }
"float"        { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_FLOAT'; }
"while"        { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_WHILE'; }
"track"        { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_TRACK'; }
"empty"        { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_EMPTY'; }
"each"         { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_EACH'; }
"case"         { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_CASE'; }
"char"         { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_CHAR'; }
"else"         { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_ELSE'; }
"for"          { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_FOR'; }
"int"          { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_INT'; }
"if"           { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_IF'; }
"do"           { addTok('KEYWORD',yytext,yylineno+1,yylloc.first_column+1); return 'KW_DO'; }

/*  BOOLEANOS / NULL (celeste)  */
"true"|"True"   { addTok('BOOLEAN',yytext,yylineno+1,yylloc.first_column+1); return 'BOOL_LIT'; }
"false"|"False" { addTok('BOOLEAN',yytext,yylineno+1,yylloc.first_column+1); return 'BOOL_LIT'; }
"null"          { addTok('NULL',   yytext,yylineno+1,yylloc.first_column+1); return 'NULL_LIT'; }

/*  NUMEROS (celeste) — HEX antes que INT  */
{HEX}          { addTok('NUMBER',yytext,yylineno+1,yylloc.first_column+1); return 'NUM'; }
{FLOAT}        { addTok('NUMBER',yytext,yylineno+1,yylloc.first_column+1); return 'NUM'; }
{INT}"%"       { addTok('NUMBER',yytext,yylineno+1,yylloc.first_column+1); return 'NUM'; }
{INT}          { addTok('NUMBER',yytext,yylineno+1,yylloc.first_column+1); return 'NUM'; }

/*  STRINGS (amarillo)  */
\"([^\\\"]|\\.)*\"
    { addTok('STRING',yytext,yylineno+1,yylloc.first_column+1); return 'STR'; }
\'([^\\\']|\\.)*\'
    { addTok('STRING',yytext,yylineno+1,yylloc.first_column+1); return 'STR'; }
\"([^\\\"\n]|\\.)*$
    { addLexErr(yytext,yylineno+1,yylloc.first_column+1,'String con comilla doble sin cerrar'); }
\'([^\\\'\n]|\\.)*$
    { addLexErr(yytext,yylineno+1,yylloc.first_column+1,'String con comilla simple sin cerrar'); }

/*  VARIABLES $nombre (naranja)  */
"$"{ID}        { addTok('IDENTIFIER',yytext,yylineno+1,yylloc.first_column+1); return 'VAR'; }

/*  REFERENCIAS @id (naranja)  */
"@"{ID}        { addTok('IDENTIFIER',yytext,yylineno+1,yylloc.first_column+1); return 'AT_ID'; }

/*  SELECTOR DE ESTILOS — DEBE IR ANTES QUE OP_LT  */
"<"[ \t]*{ID}([ \t]*","[ \t]*{ID})*[ \t]*">"
    { addTok('STYLE_REF',yytext,yylineno+1,yylloc.first_column+1); return 'STYLE_REF'; }

/*  OPERADORES (verde) — mas largos primero  */
"===" { addTok('OPERATOR','===',yylineno+1,yylloc.first_column+1); return 'OP_STRICT_EQ';  }
"!==" { addTok('OPERATOR','!==',yylineno+1,yylloc.first_column+1); return 'OP_STRICT_NEQ'; }
"=="  { addTok('OPERATOR','==', yylineno+1,yylloc.first_column+1); return 'OP_EQ';         }
"!="  { addTok('OPERATOR','!=', yylineno+1,yylloc.first_column+1); return 'OP_NEQ';        }
">="  { addTok('OPERATOR','>=', yylineno+1,yylloc.first_column+1); return 'OP_GTE';        }
"<="  { addTok('OPERATOR','<=', yylineno+1,yylloc.first_column+1); return 'OP_LTE';        }
"++"  { addTok('OPERATOR','++', yylineno+1,yylloc.first_column+1); return 'OP_INC';        }
"--"  { addTok('OPERATOR','--', yylineno+1,yylloc.first_column+1); return 'OP_DEC';        }
"+="  { addTok('OPERATOR','+=', yylineno+1,yylloc.first_column+1); return 'OP_PLUS_EQ';   }
"-="  { addTok('OPERATOR','-=', yylineno+1,yylloc.first_column+1); return 'OP_MINUS_EQ';  }
"&&"  { addTok('OPERATOR','&&', yylineno+1,yylloc.first_column+1); return 'OP_AND';        }
"||"  { addTok('OPERATOR','||', yylineno+1,yylloc.first_column+1); return 'OP_OR';         }
">"   { addTok('OPERATOR','>', yylineno+1,yylloc.first_column+1);  return 'OP_GT';         }
"<"   { addTok('OPERATOR','<', yylineno+1,yylloc.first_column+1);  return 'OP_LT';         }
"+"   { addTok('OPERATOR','+', yylineno+1,yylloc.first_column+1);  return 'OP_PLUS';       }
"-"   { addTok('OPERATOR','-', yylineno+1,yylloc.first_column+1);  return 'OP_MINUS';      }
"*"   { addTok('OPERATOR','*', yylineno+1,yylloc.first_column+1);  return 'OP_MUL';        }
"/"   { addTok('OPERATOR','/', yylineno+1,yylloc.first_column+1);  return 'OP_DIV';        }
"%"   { addTok('OPERATOR','%', yylineno+1,yylloc.first_column+1);  return 'OP_MOD';        }
"!"   { addTok('OPERATOR','!', yylineno+1,yylloc.first_column+1);  return 'OP_NOT';        }
"="   { addTok('OPERATOR','=', yylineno+1,yylloc.first_column+1);  return 'OP_ASSIGN';     }

/* ── SIMBOLOS (azul) — [[ y ]] ANTES de [ y ] ── */
"[["  { addTok('SYMBOL','[[',yylineno+1,yylloc.first_column+1); return 'TABLE_OPEN';  }
"]]"  { addTok('SYMBOL',']]',yylineno+1,yylloc.first_column+1); return 'TABLE_CLOSE'; }
"{"   { addTok('SYMBOL','{', yylineno+1,yylloc.first_column+1); return 'LBRACE';      }
"}"   { addTok('SYMBOL','}', yylineno+1,yylloc.first_column+1); return 'RBRACE';      }
"("   { addTok('SYMBOL','(', yylineno+1,yylloc.first_column+1); return 'LPAREN';      }
")"   { addTok('SYMBOL',')', yylineno+1,yylloc.first_column+1); return 'RPAREN';      }
"["   { addTok('SYMBOL','[', yylineno+1,yylloc.first_column+1); return 'LBRACK';      }
"]"   { addTok('SYMBOL',']', yylineno+1,yylloc.first_column+1); return 'RBRACK';      }
";"   { addTok('SYMBOL',';', yylineno+1,yylloc.first_column+1); return 'SEMI';        }
":"   { addTok('SYMBOL',':', yylineno+1,yylloc.first_column+1); return 'COLON';       }
","   { addTok('SYMBOL',',', yylineno+1,yylloc.first_column+1); return 'COMMA';       }
"."   { addTok('SYMBOL','.', yylineno+1,yylloc.first_column+1); return 'DOT';         }



/*  IDENTIFICADORES (naranja)  */
{ID}   { addTok('IDENTIFIER',yytext,yylineno+1,yylloc.first_column+1); return 'ID'; }

/*  WHITESPACE / NEWLINES  */
\n     { /* Jison actualiza yylineno */ }
{WS}   { /* ignorar */ }

/*  CARACTER DESCONOCIDO — error lexico  */
.
    { addLexErr(yytext,yylineno+1,yylloc.first_column+1,
        'Simbolo no reconocido: "' + yytext + '"'); }

/lex

/*  Tabla completa sin gaps. Resuelve todos los shift/reduce. */
%right    OP_ASSIGN OP_PLUS_EQ OP_MINUS_EQ
%left     OP_OR
%left     OP_AND
%right    OP_NOT
%left     OP_EQ OP_NEQ OP_STRICT_EQ OP_STRICT_NEQ
%left     OP_LT OP_LTE OP_GT OP_GTE
%left     OP_PLUS OP_MINUS
%left     OP_MUL OP_DIV OP_MOD
%right    UMINUS
%left     OP_INC OP_DEC
%left     LBRACK DOT LPAREN

%start program

%%

/* ================================================================
   PROGRAMA
   ================================================================ */
program
  : component_list
      { _ast = { type: 'Program', body: $1 }; }
  | /* vacio */
      { _ast = { type: 'Program', body: [] }; }
  ;

component_list
  : component_list component_decl  { $$ = $1.concat([$2]); }
  | component_decl                 { $$ = [$1]; }
  ;

/* ================================================================
   DECLARACION DE COMPONENTE (sin acciones intermedias)
   ================================================================ */
component_decl
  : component_head element_list RBRACE
      {
        $$ = { type: 'ComponentDecl', name: $1.name, params: $1.params, body: $2,
               line: $1.line, col: $1.col };
      }
  | component_ext_head element_list RBRACE
      {
        $$ = { type: 'ComponentDecl', name: $1.name, extendsFrom: $1.extendsFrom,
               params: $1.params, body: $2, line: $1.line, col: $1.col };
      }
  | component_head element_list error
      {
        addSynErr('}', @3.first_line, @3.first_column+1,
          'Se esperaba "}" para cerrar el componente "' + $1.name + '"');
        $$ = { type: 'ComponentDecl', name: $1.name, params: $1.params, body: $2, error: true };
      }
  | component_bad_params_head element_list RBRACE
      {
        addSynErr($1.name, $1.line, $1.col,
          'Lista de parametros invalida en el componente "' + $1.name + '"');
        $$ = { type: 'ComponentDecl', name: $1.name, params: [], body: $2, error: true };
      }
  ;

component_head
  : ID LPAREN param_list RPAREN LBRACE
      {
        enterComponent($1, $3, @1.first_line, @1.first_column+1);
        $$ = { name: $1, params: $3, line: @1.first_line, col: @1.first_column+1 };
      }
  ;

component_ext_head
  : ID KW_EXTENDS ID LPAREN param_list RPAREN LBRACE
      {
        enterComponent($1, $5, @1.first_line, @1.first_column+1);
        $$ = { name: $1, extendsFrom: $3, params: $5, line: @1.first_line, col: @1.first_column+1 };
      }
  ;

component_bad_params_head
  : ID LPAREN error RPAREN LBRACE
      {
        enterComponent($1, [], @1.first_line, @1.first_column+1);
        $$ = { name: $1, params: [], line: @1.first_line, col: @1.first_column+1 };
      }
  ;

/* ¿
   PARAMETROS
    */
param_list
  : /* vacio */       { $$ = []; }
  | param_decl_list   { $$ = $1; }
  ;

param_decl_list
  : param_decl_list COMMA param_decl  { $$ = $1.concat([$3]); }
  | param_decl                        { $$ = [$1]; }
  ;

param_decl
  : type_kw ID
      { $$ = { paramType: $1, name: $2 }; }
  | type_kw LBRACK RBRACK ID
      { $$ = { paramType: $1+'[]', name: $4 }; }
  | type_kw VAR
      { $$ = { paramType: $1, name: $2 }; }
  | type_kw LBRACK RBRACK VAR
      { $$ = { paramType: $1+'[]', name: $4 }; }
  ;

type_kw
  : KW_INT      { $$ = 'int'; }
  | KW_FLOAT    { $$ = 'float'; }
  | KW_STRING   { $$ = 'string'; }
  | KW_BOOLEAN  { $$ = 'boolean'; }
  | KW_FUNCTION { $$ = 'function'; }
  | KW_CHAR     { $$ = 'char'; }
  ;

/* 
   ELEMENTOS DE VISTA
   'element' NO incluye form_body_item.
   Las dos jerarquias son independientes.
    */
element_list
  : /* vacio */             { $$ = []; }
  | element_list element    { $$ = $1.concat([$2]); }
  ;

element
  : section_element   { $$ = $1; }
  | table_element     { $$ = $1; }
  | text_element      { $$ = $1; }
  | img_element       { $$ = $1; }
  | form_element      { $$ = $1; }
  | logic_element     { $$ = $1; }
  /* Recuperacion generica: consume hasta SEMI o RBRACE */
  | error SEMI
      {
        addSynErr(';',@1.first_line,@1.first_column+1,
          'Elemento de vista no reconocido o mal formado');
        $$ = { type: 'ErrorNode' };
      }
  | error RBRACE
      {
        addSynErr('}',@1.first_line,@1.first_column+1,
          'Bloque de vista mal cerrado o inesperado');
        $$ = { type: 'ErrorNode' };
      }
  ;

/* 
   SECCIONES  [ body ]  y  <estilos>[ body ]
   Son anidables porque element_list puede contener section_element.
    */
section_element
  : opt_style_ref LBRACK element_list RBRACK
      {
        checkStyleRef($1, @1.first_line, @1.first_column+1);
        $$ = { type: 'Section', styles: $1, body: $3,
               line: @2.first_line, col: @2.first_column+1 };
      }
  | opt_style_ref LBRACK element_list error
      {
        checkStyleRef($1, @1.first_line, @1.first_column+1);
        addSynErr(']',@4.first_line,@4.first_column+1,
          'Se esperaba "]" para cerrar la seccion');
        $$ = { type: 'Section', styles: $1, body: $3, error: true };
      }
  ;

/* 
   TABLAS   [[ filas ]]
   TABLE_OPEN y TABLE_CLOSE son tokens distintos a LBRACK/RBRACK.
   El lexer tokeniza "[[" y "]]" antes de "[" y "]".
   CERO ambiguedad con secciones.
    */
table_element
  : opt_style_ref TABLE_OPEN table_content_list TABLE_CLOSE
      {
        checkStyleRef($1, @1.first_line, @1.first_column+1);
        $$ = { type: 'Table', styles: $1, rows: $3,
               line: @2.first_line, col: @2.first_column+1 };
      }
  | opt_style_ref TABLE_OPEN table_content_list error
      {
        checkStyleRef($1, @1.first_line, @1.first_column+1);
        addSynErr(']]',@4.first_line,@4.first_column+1,
          'Se esperaba "]]" para cerrar la tabla');
        $$ = { type: 'Table', styles: $1, rows: $3, error: true };
      }
  ;

table_content_list
  : /* vacio */
      { $$ = []; }
  | table_content_list table_row
      { $$ = $1.concat([$2]); }
  | table_content_list table_for_element
      { $$ = $1.concat([$2]); }
  | table_content_list table_if_element
      { $$ = $1.concat([$2]); }
  | table_content_list table_switch_element
      { $$ = $1.concat([$2]); }
  | table_content_list table_while_element
      { $$ = $1.concat([$2]); }
  ;

/* 
   Versiones de los elementos logicos cuyo body
   es table_content_list en lugar de element_list. Esto permite que
   el for/if/switch/while */
table_for_element
  : KW_FOR KW_EACH LPAREN VAR COLON VAR RPAREN LBRACE table_content_list RBRACE table_opt_empty_block
      {
        /* [FIX] Spec: 'for each ($arreglo : $alias)'.
           El primer VAR es el ARREGLO origen (debe estar declarado).
           El segundo VAR es el ALIAS de iteracion (no se declara antes). */
        checkVarDeclared($4,@4.first_line,@4.first_column+1);
        $$ = { type:'ForEach', array:$4, item:$6, body:$9, empty:$11,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_FOR LPAREN for_binding_list RPAREN KW_TRACK VAR LBRACE table_content_list RBRACE table_opt_empty_block
      {
        $$ = { type:'ForTrack', bindings:$3, trackVar:$6, body:$8, empty:$10,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_FOR LPAREN VAR COLON VAR RPAREN LBRACE table_content_list RBRACE table_opt_empty_block
      {
        checkVarDeclared($3,@3.first_line,@3.first_column+1);
        $$ = { type:'ForEach', array:$3, item:$5, body:$8, empty:$10,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

table_opt_empty_block
  : /* vacio */                                  { $$ = null; }
  | KW_EMPTY LBRACE table_content_list RBRACE
      { $$ = { type:'EmptyBlock', body:$3 }; }
  ;

table_if_element
  : KW_IF LPAREN expr RPAREN LBRACE table_content_list RBRACE table_else_chain
      {
        $$ = { type:'If', condition:$3, thenBody:$6, elseChain:$8,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

table_else_chain
  : /* vacio */  { $$ = null; }
  | KW_ELSE LPAREN expr RPAREN LBRACE table_content_list RBRACE table_else_chain
      { $$ = { type:'ElseIf', condition:$3, body:$6, next:$8 }; }
  | KW_ELSE LBRACE table_content_list RBRACE
      { $$ = { type:'Else', body:$3 }; }
  ;

table_switch_element
  : KW_SWITCH LPAREN switch_expr RPAREN LBRACE table_case_list table_opt_default_case RBRACE
      {
        $$ = { type:'Switch', expr:$3, cases:$6, defaultCase:$7,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

table_case_list
  : /* vacio */                          { $$ = []; }
  | table_case_list table_case_item      { $$ = $1.concat([$2]); }
  ;

table_case_item
  : KW_CASE STR LBRACE table_content_list RBRACE opt_comma
      { $$ = { type:'Case', value:$2, body:$4 }; }
  | KW_CASE NUM LBRACE table_content_list RBRACE opt_comma
      { $$ = { type:'Case', value:$2, body:$4 }; }
  ;

table_opt_default_case
  : /* vacio */                                  { $$ = null; }
  | KW_DEFAULT LBRACE table_content_list RBRACE
      { $$ = { type:'Default', body:$3 }; }
  ;

table_while_element
  : KW_WHILE LPAREN expr RPAREN LBRACE table_content_list RBRACE
      {
        $$ = { type:'While', condition:$3, body:$6,
               line:@1.first_line, col:@1.first_column+1 };
      }
  ;

/* Fila/Celda unificada: [[ contenido ]]
   [FIX-TABLA-NIVELES] El spec NO distingue gramaticalmente fila de
   celda — ambas son [[ ... ]]. La diferencia es semantica:
     - Si el contenido son OTRAS [[ ]], se trata como fila.
     - Si el contenido es texto/seccion/img/logica, se trata como celda.
   El AST sigue marcando type:'TableRow' con un flag isCell que el
   renderer puede usar para decidir entre <tr> o <td>. */
table_row
  : TABLE_OPEN table_row_body TABLE_CLOSE
      { $$ = { type: 'TableRow', cells: $2 }; }
  | TABLE_OPEN table_row_body error
      {
        addSynErr(']]',@3.first_line,@3.first_column+1,
          'Se esperaba "]]" para cerrar la fila/celda');
        $$ = { type: 'TableRow', cells: $2, error: true };
      }
  ;

/* El cuerpo de una [[ ]] puede ser:
    - cero o mas [[ ]] anidadas (lo que era table_cell_list)
    - O contenido directo (texto, seccion, img, logica) */
table_row_body
  : /* vacio */                          { $$ = []; }
  | table_row_body table_row             { $$ = $1.concat([$2]); }
  | table_row_body for_element           { $$ = $1.concat([$2]); }
  | table_row_body if_element            { $$ = $1.concat([$2]); }
  | table_row_body switch_element        { $$ = $1.concat([$2]); }
  | table_row_body text_element          { $$ = $1.concat([$2]); }
  | table_row_body img_element           { $$ = $1.concat([$2]); }
  | table_row_body section_element       { $$ = $1.concat([$2]); }
  ;

/* El nombre table_cell se mantiene como alias por compatibilidad
   con codigo que pueda referirse a este simbolo. Apunta al mismo
   table_row porque ahora son sintacticamente identicos. */
table_cell_list
  : /* vacio */                          { $$ = []; }
  | table_cell_list table_row            { $$ = $1.concat([$2]); }
  ;

table_cell
  : TABLE_OPEN table_row_body TABLE_CLOSE
      { $$ = { type: 'TableCell', body: $2 }; }
  ;

/* TEXTO   T("...")  /  T<estilos>("...")*/
text_element
  : KW_T opt_style_ref LPAREN text_content_list RPAREN
      {
        checkStyleRef($2, @1.first_line, @1.first_column+1);
        $$ = { type: 'Text', styles: $2, content: $4,
               line: @1.first_line, col: @1.first_column+1 };
      }
  | KW_T opt_style_ref LPAREN error RPAREN
      {
        addSynErr('T()',@1.first_line,@1.first_column+1,
          'Contenido invalido dentro de T(...)');
        $$ = { type: 'Text', styles: $2, content: [], error: true };
      }
  | KW_T error
      {
        addSynErr('T',@1.first_line,@1.first_column+1,
          'T debe ir seguido de "(" contenido ")"');
        $$ = { type: 'Text', error: true };
      }
  ;

text_content_list
  : text_content_item                           { $$ = [$1]; }
  | text_content_list COMMA text_content_item   { $$ = $1.concat([$3]); }
  ;

text_content_item
  : STR      { $$ = { type: 'StringLit', value: $1 }; }
  | VAR
      {
        checkVarDeclared($1, @1.first_line, @1.first_column+1);
        $$ = { type: 'Var', value: $1 };
      }
  | expr     { $$ = { type: 'Expr', value: $1 }; }
  ;

/* IMAGENES   IMG("url")  /  IMG<estilos>("url1","url2",$var) */
img_element
  : KW_IMG opt_style_ref LPAREN img_src_list RPAREN
      {
        checkStyleRef($2, @1.first_line, @1.first_column+1);
        $$ = { type: 'Img', styles: $2, sources: $4,
               line: @1.first_line, col: @1.first_column+1 };
      }
  | KW_IMG opt_style_ref LPAREN error RPAREN
      {
        addSynErr('IMG()',@1.first_line,@1.first_column+1,
          'Fuentes invalidas dentro de IMG(...)');
        $$ = { type: 'Img', styles: $2, sources: [], error: true };
      }
  | KW_IMG error
      {
        addSynErr('IMG',@1.first_line,@1.first_column+1,
          'IMG debe ir seguido de "(" fuentes ")"');
        $$ = { type: 'Img', error: true };
      }
  ;

img_src_list
  : img_src                        { $$ = [$1]; }
  | img_src_list COMMA img_src     { $$ = $1.concat([$3]); }
  ;

img_src
  : STR   { $$ = { type: 'StringSrc', value: $1 }; }
  | VAR
      {
        checkVarDeclared($1, @1.first_line, @1.first_column+1);
        $$ = { type: 'VarSrc', value: $1 };
      }
  | VAR LBRACK expr RBRACK
      {
        checkVarDeclared($1, @1.first_line, @1.first_column+1);
        $$ = { type: 'VarIndexSrc', name: $1, index: $3 };
      }
  ;

/* FORMULARIO */
form_element
  : KW_FORM opt_style_ref LBRACE form_body RBRACE opt_submit
      {
        checkStyleRef($2, @1.first_line, @1.first_column+1);
        $$ = { type: 'Form', styles: $2, body: $4, submit: $6,
               line: @1.first_line, col: @1.first_column+1 };
      }
  | KW_FORM opt_style_ref LBRACE form_body error
      {
        addSynErr('}',@5.first_line,@5.first_column+1,
          'Se esperaba "}" para cerrar FORM');
        $$ = { type: 'Form', styles: $2, body: $4, error: true };
      }
  ;

form_body
  : /* vacio */                { $$ = []; }
  | form_body form_body_item   { $$ = $1.concat([$2]); }
  ;

/*
   Enumeracion explicita — sin referencia circular a 'element'.
   Permite exactamente lo que el spec menciona dentro de FORM.
*/
form_body_item
  : input_text_element    { $$ = $1; }
  | input_number_element  { $$ = $1; }
  | input_bool_element    { $$ = $1; }
  | text_element          { $$ = $1; }
  | img_element           { $$ = $1; }
  | section_element       { $$ = $1; }
  | table_element         { $$ = $1; }
  | if_element            { $$ = $1; }
  | for_element           { $$ = $1; }
  | switch_element        { $$ = $1; }
  | while_element         { $$ = $1; }
  | do_element            { $$ = $1; }
  | error SEMI
      {
        addSynErr(';',@1.first_line,@1.first_column+1,
          'Elemento no permitido o mal formado dentro de FORM');
        $$ = { type: 'ErrorNode' };
      }
  ;

/* ── INPUT_TEXT ── */
input_text_element
  : KW_INPUT_TEXT opt_style_ref LBRACE input_props RBRACE
      {
        checkStyleRef($2,@1.first_line,@1.first_column+1);
        registerInputProps($4);
        $$ = { type:'InputText', styles:$2, props:$4,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_INPUT_TEXT opt_style_ref LPAREN input_props RPAREN
      {
        checkStyleRef($2,@1.first_line,@1.first_column+1);
        registerInputProps($4);
        $$ = { type:'InputText', styles:$2, props:$4,
               line:@1.first_line, col:@1.first_column+1 };
      }
  /* [FIX] El spec del PDF muestra INPUT_TEXT abriendo con '{' y cerrando con ')'.
     Aceptamos esa combinacion mixta tal cual aparece en el spec. */
  | KW_INPUT_TEXT opt_style_ref LBRACE input_props RPAREN
      {
        checkStyleRef($2,@1.first_line,@1.first_column+1);
        registerInputProps($4);
        $$ = { type:'InputText', styles:$2, props:$4,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_INPUT_TEXT opt_style_ref LBRACE input_props error
      {
        addSynErr('}',@5.first_line,@5.first_column+1,
          'Se esperaba "}" para cerrar INPUT_TEXT');
        $$ = { type:'InputText', styles:$2, props:$4, error:true };
      }
  ;

/* ── INPUT_NUMBER ── */
input_number_element
  : KW_INPUT_NUMBER opt_style_ref LPAREN input_props RPAREN
      {
        checkStyleRef($2,@1.first_line,@1.first_column+1);
        registerInputProps($4);
        $$ = { type:'InputNumber', styles:$2, props:$4,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_INPUT_NUMBER opt_style_ref LPAREN input_props error
      {
        addSynErr(')',@5.first_line,@5.first_column+1,
          'Se esperaba ")" para cerrar INPUT_NUMBER');
        $$ = { type:'InputNumber', styles:$2, props:$4, error:true };
      }
  ;

/* ── INPUT_BOOL ── */
input_bool_element
  : KW_INPUT_BOOL opt_style_ref LPAREN input_props RPAREN
      {
        checkStyleRef($2,@1.first_line,@1.first_column+1);
        registerInputProps($4);
        $$ = { type:'InputBool', styles:$2, props:$4,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_INPUT_BOOL opt_style_ref LPAREN input_props error
      {
        addSynErr(')',@5.first_line,@5.first_column+1,
          'Se esperaba ")" para cerrar INPUT_BOOL');
        $$ = { type:'InputBool', styles:$2, props:$4, error:true };
      }
  ;

/* ── Propiedades de input: key : value [,] ── */
input_props
  : /* vacio */               { $$ = []; }
  | input_props input_prop    { $$ = $1.concat([$2]); }
  ;

input_prop
  : ID COLON input_prop_value COMMA  { $$ = { key:$1, value:$3 }; }
  | ID COLON input_prop_value        { $$ = { key:$1, value:$3 }; }
  ;

input_prop_value
  : STR      { $$ = { type:'StringLit', value:$1 }; }
  | NUM      { $$ = { type:'NumLit',    value:$1 }; }
  | BOOL_LIT { $$ = { type:'BoolLit',   value:$1 }; }
  | VAR
      {
        checkVarDeclared($1,@1.first_line,@1.first_column+1);
        $$ = { type:'Var', value:$1 };
      }
  | VAR LBRACK expr RBRACK
      {
        checkVarDeclared($1,@1.first_line,@1.first_column+1);
        $$ = { type:'VarIndex', name:$1, index:$3 };
      }
  ;

/* SUBMIT */
opt_submit
  : /* vacio */   { $$ = null; }
  | submit_block  { $$ = $1; }
  ;

submit_block
  : KW_SUBMIT opt_style_ref LBRACE submit_body RBRACE
      {
        checkStyleRef($2,@1.first_line,@1.first_column+1);
        $$ = { type:'Submit', styles:$2, body:$4,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_SUBMIT opt_style_ref LBRACE submit_body error
      {
        addSynErr('}',@5.first_line,@5.first_column+1,
          'Se esperaba "}" para cerrar SUBMIT');
        $$ = { type:'Submit', styles:$2, body:$4, error:true };
      }
  ;

submit_body
  : /* vacio */               { $$ = []; }
  | submit_body submit_prop   { $$ = $1.concat([$2]); }
  ;

submit_prop
  : ID COLON STR COMMA               { $$ = { key:$1, value:$3 }; }
  | ID COLON STR                     { $$ = { key:$1, value:$3 }; }
  | KW_FUNCTION COLON fn_call COMMA  { $$ = { key:'function', value:$3 }; }
  | KW_FUNCTION COLON fn_call        { $$ = { key:'function', value:$3 }; }
  ;

/* Llamada de funcion en SUBMIT: $fn(@id1, @id2) */
fn_call
  : VAR LPAREN at_arg_list RPAREN
      {
        checkFnRef($1,@1.first_line,@1.first_column+1);
        $$ = { type:'FnCall', name:$1, args:$3 };
      }
  | ID LPAREN at_arg_list RPAREN
      { $$ = { type:'FnCall', name:$1, args:$3 }; }
  ;

at_arg_list
  : /* vacio */                 { $$ = []; }
  | at_arg                      { $$ = [$1]; }
  | at_arg_list COMMA at_arg    { $$ = $1.concat([$3]); }
  ;

at_arg
  : AT_ID
      {
        checkAtRef($1,@1.first_line,@1.first_column+1);
        $$ = { type:'AtRef', value:$1 };
      }
  | VAR
      {
        checkVarDeclared($1,@1.first_line,@1.first_column+1);
        $$ = { type:'Var', value:$1 };
      }
  | expr  { $$ = { type:'Expr', value:$1 }; }
  ;

/* LOGICA DE VISTA */
logic_element
  : if_element      { $$ = $1; }
  | for_element     { $$ = $1; }
  | switch_element  { $$ = $1; }
  | while_element   { $$ = $1; }   /* [FIX-4] */
  | do_element      { $$ = $1; }   /* [FIX-4] */
  ;

/* ── IF / ELSE-IF / ELSE ── */
if_element
  : KW_IF LPAREN expr RPAREN LBRACE element_list RBRACE else_chain
      {
        $$ = { type:'If', condition:$3, thenBody:$6, elseChain:$8,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_IF LPAREN expr RPAREN LBRACE element_list error
      {
        addSynErr('}',@7.first_line,@7.first_column+1,
          'Se esperaba "}" para cerrar bloque if');
        $$ = { type:'If', condition:$3, thenBody:$6, error:true };
      }
  | KW_IF LPAREN error RPAREN LBRACE element_list RBRACE
      {
        addSynErr('if()',@1.first_line,@1.first_column+1,
          'Condicion invalida en if(...)');
        $$ = { type:'If', condition:null, thenBody:$6, error:true };
      }
  ;

/*
   else_chain: lineal para evitar ambiguedad en LALR(1).
   'else ( cond )' del spec .comp: la condicion va entre parentesis.
*/
else_chain
  : /* vacio */  { $$ = null; }
  | KW_ELSE LPAREN expr RPAREN LBRACE element_list RBRACE else_chain
      { $$ = { type:'ElseIf', condition:$3, body:$6, next:$8 }; }
  | KW_ELSE LBRACE element_list RBRACE
      { $$ = { type:'Else', body:$3 }; }
  ;

/* ── FOR EACH / FOR TRACK ── */
for_element
  /* for each ($arreglo : $alias) { body } [ empty { alt } ] */
  : KW_FOR KW_EACH LPAREN VAR COLON VAR RPAREN LBRACE element_list RBRACE opt_empty_block
      {
        /* [FIX] El primer VAR es el ARREGLO origen, el segundo el ALIAS. */
        checkVarDeclared($4,@4.first_line,@4.first_column+1);
        $$ = { type:'ForEach', array:$4, item:$6, body:$9, empty:$11,
               line:@1.first_line, col:@1.first_column+1 };
      }
  /* for ($bindings) track $index { body } [ empty { alt } ] */
  | KW_FOR LPAREN for_binding_list RPAREN KW_TRACK VAR LBRACE element_list RBRACE opt_empty_block
      {
        $$ = { type:'ForTrack', bindings:$3, trackVar:$6, body:$8, empty:$10,
               line:@1.first_line, col:@1.first_column+1 };
      }
  /* for ($arreglo : $alias) { body } — forma corta sin each */
  | KW_FOR LPAREN VAR COLON VAR RPAREN LBRACE element_list RBRACE opt_empty_block
      {
        checkVarDeclared($3,@3.first_line,@3.first_column+1);
        $$ = { type:'ForEach', array:$3, item:$5, body:$8, empty:$10,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_FOR LPAREN error RPAREN LBRACE element_list RBRACE
      {
        addSynErr('for()',@1.first_line,@1.first_column+1,
          'Expresion for invalida. Use: "for each ($arreglo : $alias)" o "for ($bindings) track $i"');
        $$ = { type:'For', error:true };
      }
  ;

for_binding_list
  : for_binding                         { $$ = [$1]; }
  | for_binding_list COMMA for_binding  { $$ = $1.concat([$3]); }
  ;

for_binding
  : VAR COLON VAR
      {
        /* [FIX] $1 = arreglo origen, $3 = alias */
        checkVarDeclared($1,@1.first_line,@1.first_column+1);
        $$ = { array:$1, item:$3 };
      }
  ;

opt_empty_block
  : /* vacio */                             { $$ = null; }
  | KW_EMPTY LBRACE element_list RBRACE
      { $$ = { type:'EmptyBlock', body:$3 }; }
  ;

/* ── SWITCH / case / default ── */
switch_element
  : KW_SWITCH LPAREN switch_expr RPAREN LBRACE case_list opt_default_case RBRACE
      {
        $$ = { type:'Switch', expr:$3, cases:$6, defaultCase:$7,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_SWITCH LPAREN error RPAREN LBRACE case_list opt_default_case RBRACE
      {
        addSynErr('Switch()',@1.first_line,@1.first_column+1,
          'Expresion invalida en Switch(...)');
        $$ = { type:'Switch', error:true };
      }
  | KW_SWITCH LPAREN switch_expr RPAREN LBRACE case_list opt_default_case error
      {
        addSynErr('}',@8.first_line,@8.first_column+1,
          'Se esperaba "}" para cerrar Switch');
        $$ = { type:'Switch', expr:$3, cases:$6, error:true };
      }
  ;

switch_expr
  : VAR                     { $$ = { type:'Var', value:$1 }; }
  | VAR LBRACK expr RBRACK  { $$ = { type:'VarIndex', name:$1, index:$3 }; }
  | ID                      { $$ = { type:'Identifier', value:$1 }; }
  ;

case_list
  : /* vacio */              { $$ = []; }
  | case_list case_item      { $$ = $1.concat([$2]); }
  ;

case_item
  : KW_CASE STR LBRACE element_list RBRACE opt_comma
      { $$ = { type:'Case', value:$2, body:$4 }; }
  | KW_CASE NUM LBRACE element_list RBRACE opt_comma
      { $$ = { type:'Case', value:$2, body:$4 }; }
  ;

opt_comma
  : /* vacio */ { }
  | COMMA       { }
  ;

opt_default_case
  : /* vacio */                             { $$ = null; }
  | KW_DEFAULT LBRACE element_list RBRACE
      { $$ = { type:'Default', body:$3 }; }
  ;

/* 
   [FIX-4] WHILE — regla gramatical completa con AST y recuperacion
   while ( cond ) { body }
    */
while_element
  : KW_WHILE LPAREN expr RPAREN LBRACE element_list RBRACE
      {
        $$ = { type:'While', condition:$3, body:$6,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_WHILE LPAREN expr RPAREN LBRACE element_list error
      {
        addSynErr('}',@7.first_line,@7.first_column+1,
          'Se esperaba "}" para cerrar while');
        $$ = { type:'While', condition:$3, body:$6, error:true };
      }
  | KW_WHILE LPAREN error RPAREN LBRACE element_list RBRACE
      {
        addSynErr('while()',@1.first_line,@1.first_column+1,
          'Condicion invalida en while(...)');
        $$ = { type:'While', condition:null, body:$6, error:true };
      }
  ;

/* 
   [FIX-4] DO-WHILE regla gramatical completa con AST y recuperacion
   do { body } while ( cond )
    */
do_element
  : KW_DO LBRACE element_list RBRACE KW_WHILE LPAREN expr RPAREN
      {
        $$ = { type:'DoWhile', body:$3, condition:$7,
               line:@1.first_line, col:@1.first_column+1 };
      }
  | KW_DO LBRACE element_list error KW_WHILE LPAREN expr RPAREN
      {
        addSynErr('}',@4.first_line,@4.first_column+1,
          'Se esperaba "}" para cerrar bloque do');
        $$ = { type:'DoWhile', body:$3, condition:$7, error:true };
      }
  | KW_DO LBRACE element_list RBRACE KW_WHILE LPAREN error RPAREN
      {
        addSynErr('while()',@7.first_line,@7.first_column+1,
          'Condicion invalida en do...while(...)');
        $$ = { type:'DoWhile', body:$3, condition:null, error:true };
      }
  ;

/* EXPRESIONES — jerarquia unificada */
expr
  : expr OP_PLUS   expr   { $$ = { op:'+',   left:$1, right:$3 }; }
  | expr OP_MINUS  expr   { $$ = { op:'-',   left:$1, right:$3 }; }
  | expr OP_MUL    expr   { $$ = { op:'*',   left:$1, right:$3 }; }
  | expr OP_DIV    expr   { $$ = { op:'/',   left:$1, right:$3 }; }
  | expr OP_MOD    expr   { $$ = { op:'%',   left:$1, right:$3 }; }
  | expr OP_EQ         expr  { $$ = { op:'==',  left:$1, right:$3 }; }
  | expr OP_NEQ        expr  { $$ = { op:'!=',  left:$1, right:$3 }; }
  | expr OP_STRICT_EQ  expr  { $$ = { op:'===', left:$1, right:$3 }; }
  | expr OP_STRICT_NEQ expr  { $$ = { op:'!==', left:$1, right:$3 }; }
  | expr OP_GT         expr  { $$ = { op:'>',   left:$1, right:$3 }; }
  | expr OP_GTE        expr  { $$ = { op:'>=',  left:$1, right:$3 }; }
  | expr OP_LT         expr  { $$ = { op:'<',   left:$1, right:$3 }; }
  | expr OP_LTE        expr  { $$ = { op:'<=',  left:$1, right:$3 }; }
  | expr OP_AND  expr        { $$ = { op:'&&',  left:$1, right:$3 }; }
  | expr OP_OR   expr        { $$ = { op:'||',  left:$1, right:$3 }; }
  | OP_MINUS expr %prec UMINUS  { $$ = { op:'unary-', operand:$2 }; }
  | OP_NOT   expr               { $$ = { op:'!',      operand:$2 }; }
  | VAR OP_INC   { $$ = { op:'++post', operand:$1 }; }
  | VAR OP_DEC   { $$ = { op:'--post', operand:$1 }; }
  | VAR LBRACK expr RBRACK
      {
        checkVarDeclared($1,@1.first_line,@1.first_column+1);
        $$ = { type:'VarIndex', name:$1, index:$3 };
      }
  | LPAREN expr RPAREN   { $$ = $2; }
  | VAR
      {
        checkVarDeclared($1,@1.first_line,@1.first_column+1);
        $$ = { type:'Var', value:$1 };
      }
  | NUM       { $$ = { type:'NumLit',    value:$1 }; }
  | STR       { $$ = { type:'StringLit', value:$1 }; }
  | BOOL_LIT  { $$ = { type:'BoolLit',   value:$1 }; }
  | NULL_LIT  { $$ = { type:'NullLit' }; }
  | ID        { $$ = { type:'Identifier', value:$1 }; }
  ;

/* 
   REFERENCIA DE ESTILOS OPCIONAL
   STYLE_REF es un token compuesto "<e1,e2>" — evita conflicto con OP_LT
    */
opt_style_ref
  : /* vacio */  { $$ = []; }
  | STYLE_REF
      {
        var inner = $1.slice(1, -1);
        $$ = inner.split(',').map(function(s){ return s.trim(); });
      }
  ;

%%

/* 
   API PUBLICA — expuesta a Angular / Node
   Angular NO valida nada. Solo llama a parse() y consume resultados. */
if (typeof module !== 'undefined' && module.exports) {

  /*
   [FIX-1] parseError CORREGIDO:
   - Errores 'recuperables' (hash.recoverable === true): registrar y NO lanzar.
     Esto permite que Jison active las producciones 'error' de la gramatica.
   - Errores fatales (hash.recoverable === false): registrar Y lanzar.
     El catch exterior captura y devuelve AST parcial.

   VERSION ANTERIOR: siempre lanzaba throw, lo que cancelaba toda
   recuperacion sintactica y dejaba las reglas 'error' sin efecto.
  */
  parser.yy.parseError = function(msg, hash) {
    var lex  = hash && hash.text  ? hash.text                    : '';
    var line = hash && hash.loc   ? hash.loc.first_line          : 0;
    var col  = hash && hash.loc   ? hash.loc.first_column + 1    : 0;

    addSynErr(lex, line, col, msg);

    if (hash && hash.recoverable) {
      /* Recuperable: Jison continuara con la siguiente produccion error */
      return;
    }
    /* No recuperable: detener el parse */
    throw new Error(msg);
  };

  /**
   * parse(sourceCode, stylesContext?)
   *
   * @param {string} input        - Codigo fuente .comp
   * @param {object} stylesCtx    - Opcional: { 'mi-estilo': true, ... }
   *                                Permite validar referencias <estilo>.
   * @returns {{ tokens, lexErrors, syntaxErrors, ast }}
   *
   * Uso desde Angular:
   *   const result = compParser.parse(editorContent, this.stylesMap);
   *   this.tokens       = result.tokens;        // para highlighting
   *   this.lexErrors    = result.lexErrors;      // tabla de errores
   *   this.syntaxErrors = result.syntaxErrors;   // tabla de errores
   *   this.ast          = result.ast;            // arbol parseado
   */
  exports.parseComp = function(input, stylesCtx) {
    _reset();

    if (stylesCtx && typeof stylesCtx === 'object') {
      _declaredStyles = stylesCtx;
    }

    try {
      parser.parse(input);
    } catch(e) {
      if (!_ast) {
        _ast = { type: 'Program', body: [], error: true };
      }
    }

    return _results();
  };

  /**
   * registerStyles(map)
   * Registrar estilos ANTES de parsear .comp (llamar desde Angular
   * despues de parsear el .styles del proyecto).
   *
   * @param {object} map - { 'nombre-estilo': true, ... }
   */
  exports.registerStyles = function(map) {
    _declaredStyles = map || {};
  };

  exports.getResults = _results;
}