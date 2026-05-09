%{
/* ── Almacenes de errores (accesibles desde acciones) ── */
var lexicalErrors = [];
var syntaxErrors  = [];

/* ── Helpers para construir nodos AST ── */
function makeStyle(name, ext, props, loc) {
  return {
    type:       'StyleDeclaration',
    name:       name,
    extends:    ext || null,
    properties: props,
    loc:        loc
  };
}

function makeProp(key, value, loc) {
  return { type: 'Property', key: key, value: value, loc: loc };
}

function makeFor(variable, from, to, inclusive, body, loc) {
  return {
    type:      'ForLoop',
    variable:  variable,
    from:      from,
    to:        to,
    inclusive: inclusive,   // true = through (1..4 inclusive), false = to (1..3)
    body:      body,
    loc:       loc
  };
}

function makeNumber(v)  { return { type: 'Number',  value: parseFloat(v) }; }
function makePercent(v) { return { type: 'Percent', value: parseFloat(v) }; }
function makeColor(v)   { return { type: 'Color',   value: v }; }
function makeIdent(v)   { return { type: 'Ident',   value: v }; }
function makeVar(v)     { return { type: 'Var',     name:  v }; }
function makeBinOp(op, l, r) { return { type: 'BinOp', op: op, left: l, right: r }; }
function makeUnary(e)   { return { type: 'Unary',   op: '-', expr: e }; }
function makeBorder(w, s, c) { return { type: 'BorderShorthand', width: w, style: s, color: c }; }
function makeStringVal(v)   { return { type: 'String',   value: v.slice(1, -1) }; }

/*  Localización: envuelve yylineno/yylloc que provee Jison  */
function loc(l) {
  return { line: l.first_line, col: l.first_column };
}
%}

/* SECCIÓN LÉXICA */
%lex
%%

/*  Espacios y saltos de línea  */
\s+                             /* ignorar */

/*  Comentarios de bloque */
"/*"[\s\S]*?"*/"                /* ignorar comentario */

/* Comentario no cerrado  error léxico */
"/*"[\s\S]*<<EOF>>  {
  lexicalErrors.push({
    lexema:      '/*',
    linea:       yylineno + 1,
    columna:     yylloc.first_column,
    descripcion: 'Comentario de bloque no cerrado (falta */).'
  });
}

/*  Palabras reservadas: deben ir ANTES que IDENT ───────── */
"extends"                       return 'EXTENDS'
"@for"                          return 'AT_FOR'
"from"                          return 'FROM'
"through"                       return 'THROUGH'
"to"                            return 'TO'

/*  Propiedades compuestas (multi-palabra)  */
/* Deben ir antes de palabras simples para evitar ambigüedad  */
"background color"              return 'P_BG_COLOR'
"text align"                    return 'P_TEXT_ALIGN'
"text size"                     return 'P_TEXT_SIZE'
"text font"                     return 'P_TEXT_FONT'
"padding left"                  return 'P_PADDING_LEFT'
"padding top"                   return 'P_PADDING_TOP'
"padding right"                 return 'P_PADDING_RIGHT'
"padding bottom"                return 'P_PADDING_BOTTOM'
"margin left"                   return 'P_MARGIN_LEFT'
"margin top"                    return 'P_MARGIN_TOP'
"margin right"                  return 'P_MARGIN_RIGHT'
"margin bottom"                 return 'P_MARGIN_BOTTOM'
"border radius"                 return 'P_BORDER_RADIUS'
"border style"                  return 'P_BORDER_STYLE'
"border width"                  return 'P_BORDER_WIDTH'
"border color"                  return 'P_BORDER_COLOR'
"border top style"              return 'P_BORDER_TOP_STYLE'
"border top"                    return 'P_BORDER_TOP'
"border right style"            return 'P_BORDER_RIGHT_STYLE'
"border right"                  return 'P_BORDER_RIGHT'
"border bottom style"           return 'P_BORDER_BOTTOM_STYLE'
"border bottom"                 return 'P_BORDER_BOTTOM'
"border left style"             return 'P_BORDER_LEFT_STYLE'
"border left"                   return 'P_BORDER_LEFT'
"min-width"                     return 'P_MIN_WIDTH'
"max-width"                     return 'P_MAX_WIDTH'
"min-height"                    return 'P_MIN_HEIGHT'
"max-height"                    return 'P_MAX_HEIGHT'

/*  Propiedades simples  */
"height"                        return 'P_HEIGHT'
"width"                         return 'P_WIDTH'
"color"                         return 'P_COLOR'
"padding"                       return 'P_PADDING'
"margin"                        return 'P_MARGIN'
"border"                        return 'P_BORDER'

/*  Valores de dirección (text-align)  */
"CENTER"                        return 'V_DIR'
"RIGHT"                         return 'V_DIR'
"LEFT"                          return 'V_DIR'

/*  Valores de font-family  */
"HELVETICA"                     return 'V_FONT'
"SANS SERIF"                    return 'V_FONT'
"SANS"                          return 'V_FONT'
"MONO"                          return 'V_FONT'
"CURSIVE"                       return 'V_FONT'

/*  Valores de border-style  */
"DOTTED"                        return 'V_BSTYLE'
"LINE"                          return 'V_BSTYLE'
"DOUBLE"                        return 'V_BSTYLE'
"solid"                         return 'V_BSTYLE'
"dashed"                        return 'V_BSTYLE'
"dotted"                        return 'V_BSTYLE'

/*  Cadenas de texto (para valores como text-font, text-align)  */
\"([^"\\\n]|\\.)*\"             return 'STRING'
\'([^'\\\n]|\\.)*\'             return 'STRING'

/*  Número con porcentaje  */
[0-9]+"%"                       return 'PERCENT'

/*  Número decimal o entero  */
[0-9]+("."[0-9]+)?              return 'NUMBER'

/*  Variable de bucle $nombre  */
"$"[a-zA-Z_][a-zA-Z0-9_]*      return 'VAR'

/*  Identificador (nombres de clases, colores CSS)  */
/* Admite guiones internos: mi-estilo, lightgray, my-font    */
[a-zA-Z_][a-zA-Z0-9_\-]*       return 'IDENT'

/*  Operadores aritméticos  */
"*"                             return '*'
"/"                             return '/'
"+"                             return '+'
"-"                             return '-'
"%"                             return '%'

/*  Delimitadores  */
"{"                             return 'LBRACE'
"}"                             return 'RBRACE'
"="                             return '='
";"                             return ';'

/*  Fin de entrada  */
<<EOF>>                         return 'EOF'

/*  Token inválido error léxico (NO detiene el parser)  */
.  {
  lexicalErrors.push({
    lexema:      yytext,
    linea:       yylineno + 1,
    columna:     yylloc.first_column,
    descripcion: 'Símbolo no reconocido en el lenguaje .styles: "' + yytext + '".'
  });
  /* No retornamos token, el lexer sigue al siguiente carácter */
}

/lex

/* PRECEDENCIAS (de menor a mayor) */
%left  '+' '-'
%left  '*' '/' '%'
%right UMINUS

/* SÍMBOLO INICIAL*/
%start stylesheet

%%

/* REGLAS GRAMATICALES */

/*  Hoja de estilos: lista de declaraciones y bucles  */
stylesheet
  : rule_list EOF
      { return { ast: $1, lexicalErrors: lexicalErrors, syntaxErrors: syntaxErrors }; }
  ;

rule_list
  : /* vacío */
      { $$ = []; }
  | rule_list style_rule
      { $$ = $1; if ($2) $$.push($2); }
  | rule_list for_loop
      { $$ = $1; $$.push($2); }
  | rule_list error RBRACE
      {
        syntaxErrors.push({
          lexema:      '}',
          linea:       @$.last_line,
          columna:     @$.last_column,
          descripcion: 'Estructura de estilo inválida. Se descartó hasta "}".'
        });
        $$ = $1;
      }
  ;

/*  Declaración de estilo  */
/*
  Formas válidas:
    mi-estilo { ... }
    mi-estilo extends super-estilo { ... }
    my-font-$i { ... }           ← dentro de un @for
*/
style_rule
  : style_name LBRACE property_list RBRACE
      { $$ = makeStyle($1, null, $3, loc(@1)); }

  | style_name EXTENDS style_name LBRACE property_list RBRACE
      { $$ = makeStyle($1, $3, $5, loc(@1)); }

  | style_name LBRACE property_list error
      {
        syntaxErrors.push({
          lexema:      '}',
          linea:       @$.last_line,
          columna:     @$.last_column,
          descripcion: 'Se esperaba "}" para cerrar la declaración de estilo "' + $1 + '".'
        });
        $$ = makeStyle($1, null, $3, loc(@1));

      }
  ;

/* Nombre de estilo: puede ser IDENT puro o IDENT-$var (dentro de @for) */
style_name
  : IDENT               { $$ = $1; }
  | IDENT '-' VAR       { $$ = $1 + '-' + $3; }
  | IDENT VAR           { $$ = $1 + $2; }
  ;

/*  Lista de propiedades  */
property_list
  : /* vacío */         { $$ = []; }
  | property_list property
      { $$ = $1; $$.push($2); }
  ;

/*  Propiedades individuales  */
property
  /* Dimensiones numéricas */
  : P_HEIGHT      '=' dimension ';'    { $$ = makeProp('height',      $3, loc(@1)); }
  | P_WIDTH       '=' dimension ';'    { $$ = makeProp('width',       $3, loc(@1)); }
  | P_MIN_WIDTH   '=' dimension ';'    { $$ = makeProp('min-width',   $3, loc(@1)); }
  | P_MAX_WIDTH   '=' dimension ';'    { $$ = makeProp('max-width',   $3, loc(@1)); }
  | P_MIN_HEIGHT  '=' dimension ';'    { $$ = makeProp('min-height',  $3, loc(@1)); }
  | P_MAX_HEIGHT  '=' dimension ';'    { $$ = makeProp('max-height',  $3, loc(@1)); }

  /* Color de fondo y de texto */
  | P_BG_COLOR    '=' color_val ';'   { $$ = makeProp('background-color', $3, loc(@1)); }
  | P_COLOR       '=' color_val ';'   { $$ = makeProp('color',        $3, loc(@1)); }

  /* Tipografía */
  | P_TEXT_ALIGN  '=' V_DIR   ';'    { $$ = makeProp('text-align',   makeIdent($3),    loc(@1)); }
  | P_TEXT_ALIGN  '=' STRING  ';'    { $$ = makeProp('text-align',   makeStringVal($3), loc(@1)); }
  | P_TEXT_SIZE   '=' expr    ';'    { $$ = makeProp('font-size',    $3,               loc(@1)); }
  | P_TEXT_FONT   '=' V_FONT  ';'    { $$ = makeProp('font-family',  makeIdent($3),    loc(@1)); }
  | P_TEXT_FONT   '=' STRING  ';'    { $$ = makeProp('font-family',  makeStringVal($3), loc(@1)); }

  /* Padding */
  | P_PADDING        '=' expr ';'   { $$ = makeProp('padding',        $3, loc(@1)); }
  | P_PADDING_LEFT   '=' expr ';'   { $$ = makeProp('padding-left',   $3, loc(@1)); }
  | P_PADDING_TOP    '=' expr ';'   { $$ = makeProp('padding-top',    $3, loc(@1)); }
  | P_PADDING_RIGHT  '=' expr ';'   { $$ = makeProp('padding-right',  $3, loc(@1)); }
  | P_PADDING_BOTTOM '=' expr ';'   { $$ = makeProp('padding-bottom', $3, loc(@1)); }

  /* Margin */
  | P_MARGIN        '=' expr ';'   { $$ = makeProp('margin',         $3, loc(@1)); }
  | P_MARGIN_LEFT   '=' expr ';'   { $$ = makeProp('margin-left',    $3, loc(@1)); }
  | P_MARGIN_TOP    '=' expr ';'   { $$ = makeProp('margin-top',     $3, loc(@1)); }
  | P_MARGIN_RIGHT  '=' expr ';'   { $$ = makeProp('margin-right',   $3, loc(@1)); }
  | P_MARGIN_BOTTOM '=' expr ';'   { $$ = makeProp('margin-bottom',  $3, loc(@1)); }

  /* Border radius */
  | P_BORDER_RADIUS '=' expr ';'   { $$ = makeProp('border-radius',  $3, loc(@1)); }

  /* Border shorthand: border = 2 solid red */
  | P_BORDER '=' expr V_BSTYLE color_val ';'
      { $$ = makeProp('border', makeBorder($3, $4, $5), loc(@1)); }
  | P_BORDER_TOP    '=' expr V_BSTYLE color_val ';'
      { $$ = makeProp('border-top',    makeBorder($3, $4, $5), loc(@1)); }
  | P_BORDER_RIGHT  '=' expr V_BSTYLE color_val ';'
      { $$ = makeProp('border-right',  makeBorder($3, $4, $5), loc(@1)); }
  | P_BORDER_BOTTOM '=' expr V_BSTYLE color_val ';'
      { $$ = makeProp('border-bottom', makeBorder($3, $4, $5), loc(@1)); }
  | P_BORDER_LEFT   '=' expr V_BSTYLE color_val ';'
      { $$ = makeProp('border-left',   makeBorder($3, $4, $5), loc(@1)); }

  /* Border style individual */
  | P_BORDER_STYLE       '=' V_BSTYLE ';'  { $$ = makeProp('border-style',        makeIdent($3), loc(@1)); }
  | P_BORDER_TOP_STYLE   '=' V_BSTYLE ';'  { $$ = makeProp('border-top-style',    makeIdent($3), loc(@1)); }
  | P_BORDER_RIGHT_STYLE '=' V_BSTYLE ';'  { $$ = makeProp('border-right-style',  makeIdent($3), loc(@1)); }
  | P_BORDER_BOTTOM_STYLE '=' V_BSTYLE ';' { $$ = makeProp('border-bottom-style', makeIdent($3), loc(@1)); }
  | P_BORDER_LEFT_STYLE  '=' V_BSTYLE ';'  { $$ = makeProp('border-left-style',   makeIdent($3), loc(@1)); }

  /* Border width / color */
  | P_BORDER_WIDTH '=' expr      ';'  { $$ = makeProp('border-width', $3,             loc(@1)); }
  | P_BORDER_COLOR '=' color_val ';'  { $$ = makeProp('border-color', $3,             loc(@1)); }

  /* ── Error de recuperación: propiedad mal escrita o falta ; ── */
  | error ';'
      {
        syntaxErrors.push({
          lexema:      ($3 ? String($3) : '?'),
          linea:       @$.last_line,
          columna:     0,
          descripcion: 'Propiedad no reconocida o falta ";" al final de la instrucción.'
        });
        $$ = null;

      }
  ;

/*  Valor de color: nombre CSS o variable  */
color_val
  : IDENT   { $$ = makeColor($1); }
  | VAR     { $$ = makeVar($1);   }
  ;

/*  Dimensión: número, porcentaje o expresión  */
dimension
  : expr    { $$ = $1; }
  | PERCENT { $$ = makePercent($1); }
  ;

/*  Expresiones numéricas con precedencia correcta  */
expr
  : expr '+' term   { $$ = makeBinOp('+', $1, $3); }
  | expr '-' term   { $$ = makeBinOp('-', $1, $3); }
  | term            { $$ = $1; }
  ;

term
  : term '*' factor { $$ = makeBinOp('*', $1, $3); }
  | term '/' factor { $$ = makeBinOp('/', $1, $3); }
  | term '%' factor { $$ = makeBinOp('%', $1, $3); }
  | factor          { $$ = $1; }
  ;

factor
  : NUMBER               { $$ = makeNumber($1); }
  | VAR                  { $$ = makeVar($1); }
  | '-' factor %prec UMINUS  { $$ = makeUnary($2); }
  ;

/*  Bucle @for  */
/*
  @for $i from 1 through 4 { ... }   ← inclusive (1,2,3,4)
  @for $i from 1 to 4      { ... }   ← exclusivo  (1,2,3)
*/
for_loop
  : AT_FOR VAR FROM NUMBER THROUGH NUMBER LBRACE rule_list RBRACE
      { $$ = makeFor($2, parseInt($4), parseInt($6), true,  $8, loc(@1)); }

  | AT_FOR VAR FROM NUMBER TO NUMBER LBRACE rule_list RBRACE
      { $$ = makeFor($2, parseInt($4), parseInt($6), false, $8, loc(@1)); }

  /*  Errores en @for  */
  | AT_FOR VAR FROM error
      {
        syntaxErrors.push({
          lexema:      yytext,
          linea:       @$.last_line,
          columna:     @$.last_column,
          descripcion: 'Error en @for: se esperaba un número después de "from".'
        });
        $$ = makeFor($2, 0, 0, true, [], loc(@1));

      }
  | AT_FOR error
      {
        syntaxErrors.push({
          lexema:      yytext,
          linea:       @$.last_line,
          columna:     @$.last_column,
          descripcion: 'Error en @for: se esperaba una variable ($i).'
        });
        $$ = makeFor('$?', 0, 0, true, [], loc(@1));

      }
  ;