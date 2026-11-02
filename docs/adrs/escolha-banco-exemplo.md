# Título: Escolha da Tecnologia de Banco de Dados
Número do ADR: 001
Data: 2023-08-13
Responsável: Douglas Silva
Status: Aceito

## Contexto
No início do projeto de desenvolvimento do sistema de gerenciamento de inventário, foi necessário escolher a tecnologia de banco de dados que atenderia às necessidades da aplicação. Diversas opções estavam disponíveis, incluindo bancos de dados relacionais e NoSQL.

## Decisão
Foi decidido utilizar um banco de dados relacional para o sistema de gerenciamento de inventário. A tecnologia escolhida é o PostgreSQL, devido à sua robustez, suporte a transações ACID e à sua maturidade na comunidade de desenvolvimento.

## Justificativa
A decisão de usar um banco de dados relacional, em particular o PostgreSQL, baseou-se nas seguintes razões:

- Modelagem Complexa de Dados: O sistema de gerenciamento de inventário envolve relações complexas entre produtos, fornecedores, pedidos e inventário. Um banco de dados relacional é mais adequado para modelar essas relações e manter a integridade dos dados.
- Transações e Consistência: Dado que a precisão dos dados é crucial no contexto do gerenciamento de inventário, a garantia de transações ACID oferecida pelo PostgreSQL assegura que as operações de banco de dados sejam consistentes e confiáveis.
- Suporte à Escala Futura: Embora inicialmente o projeto não exija escalabilidade massiva, a escolha do PostgreSQL oferece a possibilidade de dimensionar verticalmente o sistema no futuro, se necessário, para lidar com o aumento do volume de dados.
- Ferramentas e Comunidade: O PostgreSQL possui uma ampla gama de ferramentas, documentação e uma comunidade ativa de desenvolvedores que podem ser recursos valiosos para resolver desafios futuros.

## Alternativas Consideradas
Foram consideradas as seguintes alternativas:

- MongoDB: Um banco de dados NoSQL que é amplamente usado para cenários de dados não estruturados. No entanto, sua falta de suporte a transações ACID e a complexidade da modelagem de dados o tornaram menos adequado para as necessidades do sistema de gerenciamento de inventário.
- MySQL: Um banco de dados relacional popular, porém, dadas as características específicas da aplicação e a necessidade de suporte aprimorado para operações complexas, o PostgreSQL foi preferido.

## Consequências
A escolha do PostgreSQL como tecnologia de banco de dados traz as seguintes consequências:

- Benefícios de um Banco de Dados Relacional: A capacidade de realizar junções complexas, garantir integridade referencial e manter consistência dos dados.
- Curva de Aprendizado: A equipe precisará se familiarizar com as nuances específicas do PostgreSQL, mas a ampla documentação e a comunidade ativa são recursos valiosos.
- Potencial de Escalabilidade: A arquitetura relacional pode oferecer menos flexibilidade em termos de escalabilidade horizontal em comparação com algumas soluções NoSQL.

## Referências
- Documentação do PostgreSQL: https://www.postgresql.org/docs/
- Comparativo entre bancos de dados SQL e NoSQL: https://www.sitepoint.com/sql-vs-nosql-differences/