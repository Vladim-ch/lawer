import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@lawer.local";
const ADMIN_NAME = process.env.ADMIN_NAME || "istadmin";
const BCRYPT_ROUNDS = 12;

/* ================================================================== */
/*  Contract Templates                                                */
/* ================================================================== */

const SUPPLY_AGREEMENT_BODY = `ДОГОВОР ПОСТАВКИ № {{dogovor_nomer}}

г. {{gorod}}                                                                {{dogovor_data}}

{{postavshchik_nazvanie}}, в лице {{postavshchik_dolzhnost}} {{postavshchik_fio}}, действующего на основании {{postavshchik_osnovanie}}, именуемое в дальнейшем «Поставщик», с одной стороны, и {{pokupatel_nazvanie}}, в лице {{pokupatel_dolzhnost}} {{pokupatel_fio}}, действующего на основании {{pokupatel_osnovanie}}, именуемое в дальнейшем «Покупатель», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА

1.1. Поставщик обязуется передать в собственность Покупателю, а Покупатель обязуется принять и оплатить следующий товар: {{tovar_opisanie}} (далее — «Товар»).

1.2. Количество Товара: {{tovar_kolichestvo}}.

1.3. Качество Товара должно соответствовать требованиям ГОСТ, ТУ и иных стандартов, действующих на территории Российской Федерации.

2. ЦЕНА И ПОРЯДОК РАСЧЁТОВ

2.1. Общая стоимость Товара по настоящему Договору составляет {{tsena_summa}} ({{tsena_propisyu}}) рублей, в том числе НДС 20%.

2.2. Порядок оплаты: {{usloviya_oplaty}}.

2.3. Оплата производится путём перечисления денежных средств на расчётный счёт Поставщика.

3. СРОКИ И УСЛОВИЯ ПОСТАВКИ

3.1. Поставщик обязуется поставить Товар в срок до {{data_postavki}}.

3.2. Место поставки (доставки) Товара: {{adres_dostavki}}.

3.3. Датой поставки считается дата подписания Покупателем товарной накладной (форма ТОРГ-12).

3.4. Право собственности на Товар переходит к Покупателю с момента подписания товарной накладной.

4. ОТВЕТСТВЕННОСТЬ СТОРОН

4.1. За нарушение сроков поставки Поставщик уплачивает Покупателю неустойку в размере {{neustoyka_postavka}} от стоимости непоставленного Товара за каждый день просрочки, но не более 10% от общей стоимости Товара.

4.2. За нарушение сроков оплаты Покупатель уплачивает Поставщику неустойку в размере {{neustoyka_oplata}} от суммы задолженности за каждый день просрочки, но не более 10% от общей стоимости Товара.

4.3. Уплата неустойки не освобождает Стороны от исполнения обязательств по настоящему Договору.

5. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ

5.1. Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств по настоящему Договору, если оно явилось следствием обстоятельств непреодолимой силы (форс-мажор).

6. СРОК ДЕЙСТВИЯ ДОГОВОРА

6.1. Настоящий Договор вступает в силу с момента его подписания обеими Сторонами и действует до полного исполнения Сторонами своих обязательств.

7. РАЗРЕШЕНИЕ СПОРОВ

7.1. Все споры и разногласия разрешаются путём переговоров. В случае невозможности разрешения споров путём переговоров они подлежат рассмотрению в Арбитражном суде по месту нахождения ответчика.

8. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН

Поставщик:                                   Покупатель:
{{postavshchik_nazvanie}}                     {{pokupatel_nazvanie}}
ИНН {{postavshchik_inn}}                      ИНН {{pokupatel_inn}}
КПП {{postavshchik_kpp}}                      КПП {{pokupatel_kpp}}
Р/с {{postavshchik_rs}}                       Р/с {{pokupatel_rs}}
Банк: {{postavshchik_bank}}                   Банк: {{pokupatel_bank}}
БИК {{postavshchik_bik}}                      БИК {{pokupatel_bik}}
К/с {{postavshchik_ks}}                       К/с {{pokupatel_ks}}
Адрес: {{postavshchik_adres}}                 Адрес: {{pokupatel_adres}}

_________________ / {{postavshchik_fio}} /    _________________ / {{pokupatel_fio}} /
       М.П.                                          М.П.`;

const SUPPLY_AGREEMENT_PARAMS = [
  { name: "dogovor_nomer", description: "Номер договора", type: "string" },
  { name: "gorod", description: "Город заключения договора", type: "string" },
  { name: "dogovor_data", description: "Дата заключения договора (например, «01» января 2026 г.)", type: "date" },
  { name: "postavshchik_nazvanie", description: "Полное наименование организации-поставщика", type: "string" },
  { name: "postavshchik_dolzhnost", description: "Должность представителя поставщика (например, Генерального директора)", type: "string" },
  { name: "postavshchik_fio", description: "ФИО представителя поставщика", type: "string" },
  { name: "postavshchik_osnovanie", description: "Основание действий представителя поставщика (например, Устава)", type: "string" },
  { name: "pokupatel_nazvanie", description: "Полное наименование организации-покупателя", type: "string" },
  { name: "pokupatel_dolzhnost", description: "Должность представителя покупателя", type: "string" },
  { name: "pokupatel_fio", description: "ФИО представителя покупателя", type: "string" },
  { name: "pokupatel_osnovanie", description: "Основание действий представителя покупателя", type: "string" },
  { name: "tovar_opisanie", description: "Описание поставляемого товара", type: "text" },
  { name: "tovar_kolichestvo", description: "Количество товара с единицами измерения", type: "string" },
  { name: "tsena_summa", description: "Общая стоимость товара цифрами", type: "number" },
  { name: "tsena_propisyu", description: "Общая стоимость товара прописью", type: "string" },
  { name: "usloviya_oplaty", description: "Условия и сроки оплаты (например, 100% предоплата / 50% аванс, 50% по факту поставки)", type: "text" },
  { name: "data_postavki", description: "Крайний срок поставки товара", type: "date" },
  { name: "adres_dostavki", description: "Адрес доставки товара", type: "string" },
  { name: "neustoyka_postavka", description: "Размер неустойки за просрочку поставки (например, 0,1%)", type: "string" },
  { name: "neustoyka_oplata", description: "Размер неустойки за просрочку оплаты (например, 0,1%)", type: "string" },
  { name: "postavshchik_inn", description: "ИНН поставщика", type: "string" },
  { name: "postavshchik_kpp", description: "КПП поставщика", type: "string" },
  { name: "postavshchik_rs", description: "Расчётный счёт поставщика", type: "string" },
  { name: "postavshchik_bank", description: "Наименование банка поставщика", type: "string" },
  { name: "postavshchik_bik", description: "БИК банка поставщика", type: "string" },
  { name: "postavshchik_ks", description: "Корреспондентский счёт банка поставщика", type: "string" },
  { name: "postavshchik_adres", description: "Юридический адрес поставщика", type: "string" },
  { name: "pokupatel_inn", description: "ИНН покупателя", type: "string" },
  { name: "pokupatel_kpp", description: "КПП покупателя", type: "string" },
  { name: "pokupatel_rs", description: "Расчётный счёт покупателя", type: "string" },
  { name: "pokupatel_bank", description: "Наименование банка покупателя", type: "string" },
  { name: "pokupatel_bik", description: "БИК банка покупателя", type: "string" },
  { name: "pokupatel_ks", description: "Корреспондентский счёт банка покупателя", type: "string" },
  { name: "pokupatel_adres", description: "Юридический адрес покупателя", type: "string" },
];

const SERVICE_AGREEMENT_BODY = `ДОГОВОР ОКАЗАНИЯ УСЛУГ № {{dogovor_nomer}}

г. {{gorod}}                                                                {{dogovor_data}}

{{ispolnitel_nazvanie}}, в лице {{ispolnitel_dolzhnost}} {{ispolnitel_fio}}, действующего на основании {{ispolnitel_osnovanie}}, именуемое в дальнейшем «Исполнитель», с одной стороны, и {{zakazchik_nazvanie}}, в лице {{zakazchik_dolzhnost}} {{zakazchik_fio}}, действующего на основании {{zakazchik_osnovanie}}, именуемое в дальнейшем «Заказчик», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА

1.1. Исполнитель обязуется по заданию Заказчика оказать следующие услуги: {{uslugi_opisanie}} (далее — «Услуги»), а Заказчик обязуется оплатить эти Услуги в порядке и на условиях, предусмотренных настоящим Договором.

1.2. Результат оказания Услуг оформляется двусторонним актом сдачи-приёмки оказанных услуг.

2. ПРАВА И ОБЯЗАННОСТИ СТОРОН

2.1. Исполнитель обязуется:
  а) оказать Услуги качественно и в срок, установленный настоящим Договором;
  б) незамедлительно информировать Заказчика о любых обстоятельствах, препятствующих надлежащему оказанию Услуг;
  в) по требованию Заказчика предоставлять промежуточные отчёты о ходе оказания Услуг.

2.2. Заказчик обязуется:
  а) предоставить Исполнителю информацию и документы, необходимые для оказания Услуг;
  б) принять надлежащим образом оказанные Услуги;
  в) оплатить Услуги в порядке и сроки, установленные настоящим Договором.

3. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЁТОВ

3.1. Стоимость Услуг по настоящему Договору составляет {{tsena_summa}} ({{tsena_propisyu}}) рублей, в том числе НДС 20%.

3.2. Порядок оплаты: {{usloviya_oplaty}}.

3.3. Оплата производится путём перечисления денежных средств на расчётный счёт Исполнителя.

4. СРОКИ ОКАЗАНИЯ УСЛУГ

4.1. Дата начала оказания Услуг: {{data_nachala}}.

4.2. Дата окончания оказания Услуг: {{data_okonchaniya}}.

4.3. Акт сдачи-приёмки оказанных услуг подписывается Сторонами в течение 5 (пяти) рабочих дней с момента завершения оказания Услуг.

5. ОТВЕТСТВЕННОСТЬ СТОРОН

5.1. За нарушение сроков оказания Услуг Исполнитель уплачивает Заказчику неустойку в размере 0,1% от стоимости Услуг за каждый день просрочки, но не более 10% от общей стоимости Услуг.

5.2. За нарушение сроков оплаты Заказчик уплачивает Исполнителю неустойку в размере 0,1% от суммы задолженности за каждый день просрочки, но не более 10% от общей стоимости Услуг.

6. ОБСТОЯТЕЛЬСТВА НЕПРЕОДОЛИМОЙ СИЛЫ

6.1. Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств по настоящему Договору, если оно явилось следствием обстоятельств непреодолимой силы (форс-мажор).

7. СРОК ДЕЙСТВИЯ ДОГОВОРА

7.1. Настоящий Договор вступает в силу с момента его подписания и действует до полного исполнения Сторонами своих обязательств.

7.2. Любая из Сторон вправе расторгнуть настоящий Договор, письменно уведомив другую Сторону не менее чем за 30 (тридцать) календарных дней.

8. РАЗРЕШЕНИЕ СПОРОВ

8.1. Все споры и разногласия разрешаются путём переговоров. В случае невозможности разрешения споров путём переговоров они подлежат рассмотрению в Арбитражном суде по месту нахождения ответчика.

9. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН

Исполнитель:                                  Заказчик:
{{ispolnitel_nazvanie}}                        {{zakazchik_nazvanie}}
ИНН {{ispolnitel_inn}}                         ИНН {{zakazchik_inn}}
КПП {{ispolnitel_kpp}}                         КПП {{zakazchik_kpp}}
Р/с {{ispolnitel_rs}}                          Р/с {{zakazchik_rs}}
Банк: {{ispolnitel_bank}}                      Банк: {{zakazchik_bank}}
БИК {{ispolnitel_bik}}                         БИК {{zakazchik_bik}}
К/с {{ispolnitel_ks}}                          К/с {{zakazchik_ks}}
Адрес: {{ispolnitel_adres}}                    Адрес: {{zakazchik_adres}}

_________________ / {{ispolnitel_fio}} /       _________________ / {{zakazchik_fio}} /
       М.П.                                           М.П.`;

const SERVICE_AGREEMENT_PARAMS = [
  { name: "dogovor_nomer", description: "Номер договора", type: "string" },
  { name: "gorod", description: "Город заключения договора", type: "string" },
  { name: "dogovor_data", description: "Дата заключения договора", type: "date" },
  { name: "ispolnitel_nazvanie", description: "Полное наименование организации-исполнителя", type: "string" },
  { name: "ispolnitel_dolzhnost", description: "Должность представителя исполнителя", type: "string" },
  { name: "ispolnitel_fio", description: "ФИО представителя исполнителя", type: "string" },
  { name: "ispolnitel_osnovanie", description: "Основание действий представителя исполнителя (например, Устава)", type: "string" },
  { name: "zakazchik_nazvanie", description: "Полное наименование организации-заказчика", type: "string" },
  { name: "zakazchik_dolzhnost", description: "Должность представителя заказчика", type: "string" },
  { name: "zakazchik_fio", description: "ФИО представителя заказчика", type: "string" },
  { name: "zakazchik_osnovanie", description: "Основание действий представителя заказчика", type: "string" },
  { name: "uslugi_opisanie", description: "Подробное описание оказываемых услуг", type: "text" },
  { name: "tsena_summa", description: "Стоимость услуг цифрами", type: "number" },
  { name: "tsena_propisyu", description: "Стоимость услуг прописью", type: "string" },
  { name: "usloviya_oplaty", description: "Условия и сроки оплаты", type: "text" },
  { name: "data_nachala", description: "Дата начала оказания услуг", type: "date" },
  { name: "data_okonchaniya", description: "Дата окончания оказания услуг", type: "date" },
  { name: "ispolnitel_inn", description: "ИНН исполнителя", type: "string" },
  { name: "ispolnitel_kpp", description: "КПП исполнителя", type: "string" },
  { name: "ispolnitel_rs", description: "Расчётный счёт исполнителя", type: "string" },
  { name: "ispolnitel_bank", description: "Наименование банка исполнителя", type: "string" },
  { name: "ispolnitel_bik", description: "БИК банка исполнителя", type: "string" },
  { name: "ispolnitel_ks", description: "Корреспондентский счёт банка исполнителя", type: "string" },
  { name: "ispolnitel_adres", description: "Юридический адрес исполнителя", type: "string" },
  { name: "zakazchik_inn", description: "ИНН заказчика", type: "string" },
  { name: "zakazchik_kpp", description: "КПП заказчика", type: "string" },
  { name: "zakazchik_rs", description: "Расчётный счёт заказчика", type: "string" },
  { name: "zakazchik_bank", description: "Наименование банка заказчика", type: "string" },
  { name: "zakazchik_bik", description: "БИК банка заказчика", type: "string" },
  { name: "zakazchik_ks", description: "Корреспондентский счёт банка заказчика", type: "string" },
  { name: "zakazchik_adres", description: "Юридический адрес заказчика", type: "string" },
];

const NDA_BODY = `СОГЛАШЕНИЕ О НЕРАЗГЛАШЕНИИ КОНФИДЕНЦИАЛЬНОЙ ИНФОРМАЦИИ (NDA)

г. {{gorod}}                                                                {{dogovor_data}}

{{raskryvayushchaya_nazvanie}}, в лице {{raskryvayushchaya_dolzhnost}} {{raskryvayushchaya_fio}}, действующего на основании {{raskryvayushchaya_osnovanie}}, именуемое в дальнейшем «Раскрывающая сторона», с одной стороны, и {{poluchayushchaya_nazvanie}}, в лице {{poluchayushchaya_dolzhnost}} {{poluchayushchaya_fio}}, действующего на основании {{poluchayushchaya_osnovanie}}, именуемое в дальнейшем «Получающая сторона», с другой стороны, совместно именуемые «Стороны», заключили настоящее Соглашение о нижеследующем:

1. ПРЕДМЕТ СОГЛАШЕНИЯ

1.1. Раскрывающая сторона передаёт Получающей стороне конфиденциальную информацию, связанную с {{predmet_konfidentsialnosti}}, а Получающая сторона принимает на себя обязательства по обеспечению конфиденциальности указанной информации на условиях настоящего Соглашения.

1.2. Под конфиденциальной информацией в рамках настоящего Соглашения понимается любая информация, передаваемая Раскрывающей стороной Получающей стороне в устной, письменной, электронной или иной форме, включая, но не ограничиваясь:
  а) коммерческую тайну, ноу-хау, технические данные;
  б) финансовую информацию, бизнес-планы, стратегии;
  в) информацию о клиентах, поставщиках и контрагентах;
  г) персональные данные сотрудников и третьих лиц;
  д) иную информацию, помеченную как «Конфиденциально» или конфиденциальность которой следует из её характера.

2. ОБЯЗАТЕЛЬСТВА ПОЛУЧАЮЩЕЙ СТОРОНЫ

2.1. Получающая сторона обязуется:
  а) не разглашать конфиденциальную информацию третьим лицам без предварительного письменного согласия Раскрывающей стороны;
  б) использовать конфиденциальную информацию исключительно в целях, связанных с предметом настоящего Соглашения;
  в) обеспечить защиту конфиденциальной информации с той же степенью заботливости, с какой она защищает собственную конфиденциальную информацию, но не менее разумной степени заботливости;
  г) ограничить доступ к конфиденциальной информации кругом сотрудников, которым она необходима для выполнения служебных обязанностей, и обеспечить принятие ими аналогичных обязательств о неразглашении;
  д) незамедлительно уведомить Раскрывающую сторону о любом факте несанкционированного разглашения или использования конфиденциальной информации.

3. ИСКЛЮЧЕНИЯ

3.1. Обязательства по соблюдению конфиденциальности не распространяются на информацию, которая:
  а) является или стала общедоступной не по вине Получающей стороны;
  б) была известна Получающей стороне до момента её получения от Раскрывающей стороны;
  в) получена Получающей стороной на законных основаниях от третьих лиц без обязательства конфиденциальности;
  г) подлежит раскрытию в силу требований законодательства Российской Федерации, судебного акта или решения уполномоченного государственного органа.

4. СРОК ДЕЙСТВИЯ

4.1. Настоящее Соглашение вступает в силу с момента его подписания и действует в течение {{srok_deystviya}}.

4.2. Обязательства Получающей стороны по сохранению конфиденциальности информации сохраняют свою силу в течение {{srok_posle_okonchaniya}} после прекращения действия настоящего Соглашения.

5. ОТВЕТСТВЕННОСТЬ

5.1. В случае нарушения условий настоящего Соглашения Получающая сторона обязуется возместить Раскрывающей стороне все документально подтверждённые убытки.

5.2. Помимо возмещения убытков, Получающая сторона уплачивает Раскрывающей стороне штраф в размере {{shtraf_summa}} ({{shtraf_propisyu}}) рублей.

6. ВОЗВРАТ ИНФОРМАЦИИ

6.1. По письменному требованию Раскрывающей стороны или при прекращении действия настоящего Соглашения Получающая сторона обязуется в течение 10 (десяти) рабочих дней вернуть или уничтожить все материальные носители, содержащие конфиденциальную информацию, и подтвердить это письменно.

7. РАЗРЕШЕНИЕ СПОРОВ

7.1. Все споры и разногласия разрешаются путём переговоров. В случае невозможности разрешения споров путём переговоров они подлежат рассмотрению в Арбитражном суде по месту нахождения Раскрывающей стороны.

8. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ

8.1. Настоящее Соглашение составлено в двух экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из Сторон.

8.2. Все изменения и дополнения к настоящему Соглашению действительны только в письменной форме, подписанной обеими Сторонами.

9. РЕКВИЗИТЫ И ПОДПИСИ СТОРОН

Раскрывающая сторона:                         Получающая сторона:
{{raskryvayushchaya_nazvanie}}                 {{poluchayushchaya_nazvanie}}
ИНН {{raskryvayushchaya_inn}}                  ИНН {{poluchayushchaya_inn}}
КПП {{raskryvayushchaya_kpp}}                  КПП {{poluchayushchaya_kpp}}
Р/с {{raskryvayushchaya_rs}}                   Р/с {{poluchayushchaya_rs}}
Банк: {{raskryvayushchaya_bank}}               Банк: {{poluchayushchaya_bank}}
БИК {{raskryvayushchaya_bik}}                  БИК {{poluchayushchaya_bik}}
К/с {{raskryvayushchaya_ks}}                   К/с {{poluchayushchaya_ks}}
Адрес: {{raskryvayushchaya_adres}}             Адрес: {{poluchayushchaya_adres}}

_________________ / {{raskryvayushchaya_fio}} / _________________ / {{poluchayushchaya_fio}} /
       М.П.                                           М.П.`;

const NDA_PARAMS = [
  { name: "gorod", description: "Город заключения соглашения", type: "string" },
  { name: "dogovor_data", description: "Дата заключения соглашения", type: "date" },
  { name: "raskryvayushchaya_nazvanie", description: "Полное наименование раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_dolzhnost", description: "Должность представителя раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_fio", description: "ФИО представителя раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_osnovanie", description: "Основание действий представителя раскрывающей стороны", type: "string" },
  { name: "poluchayushchaya_nazvanie", description: "Полное наименование получающей стороны", type: "string" },
  { name: "poluchayushchaya_dolzhnost", description: "Должность представителя получающей стороны", type: "string" },
  { name: "poluchayushchaya_fio", description: "ФИО представителя получающей стороны", type: "string" },
  { name: "poluchayushchaya_osnovanie", description: "Основание действий представителя получающей стороны", type: "string" },
  { name: "predmet_konfidentsialnosti", description: "Описание предмета/области конфиденциальной информации", type: "text" },
  { name: "srok_deystviya", description: "Срок действия соглашения (например, 3 (трёх) лет)", type: "string" },
  { name: "srok_posle_okonchaniya", description: "Срок сохранения конфиденциальности после окончания соглашения (например, 5 (пяти) лет)", type: "string" },
  { name: "shtraf_summa", description: "Сумма штрафа за нарушение цифрами", type: "number" },
  { name: "shtraf_propisyu", description: "Сумма штрафа за нарушение прописью", type: "string" },
  { name: "raskryvayushchaya_inn", description: "ИНН раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_kpp", description: "КПП раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_rs", description: "Расчётный счёт раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_bank", description: "Наименование банка раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_bik", description: "БИК банка раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_ks", description: "Корреспондентский счёт банка раскрывающей стороны", type: "string" },
  { name: "raskryvayushchaya_adres", description: "Юридический адрес раскрывающей стороны", type: "string" },
  { name: "poluchayushchaya_inn", description: "ИНН получающей стороны", type: "string" },
  { name: "poluchayushchaya_kpp", description: "КПП получающей стороны", type: "string" },
  { name: "poluchayushchaya_rs", description: "Расчётный счёт получающей стороны", type: "string" },
  { name: "poluchayushchaya_bank", description: "Наименование банка получающей стороны", type: "string" },
  { name: "poluchayushchaya_bik", description: "БИК банка получающей стороны", type: "string" },
  { name: "poluchayushchaya_ks", description: "Корреспондентский счёт банка получающей стороны", type: "string" },
  { name: "poluchayushchaya_adres", description: "Юридический адрес получающей стороны", type: "string" },
];

const TEMPLATES = [
  {
    name: "Договор поставки",
    category: "договор",
    templateBody: SUPPLY_AGREEMENT_BODY,
    parameters: SUPPLY_AGREEMENT_PARAMS,
  },
  {
    name: "Договор оказания услуг",
    category: "договор",
    templateBody: SERVICE_AGREEMENT_BODY,
    parameters: SERVICE_AGREEMENT_PARAMS,
  },
  {
    name: "Соглашение о неразглашении (NDA)",
    category: "соглашение",
    templateBody: NDA_BODY,
    parameters: NDA_PARAMS,
  },
];

async function main() {
  console.log("Seeding database...");

  // ------------------------------------------------------------------
  // 1. Admin user
  // ------------------------------------------------------------------
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString("base64url");
  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      role: "admin",
      passwordHash,
      mustChangePassword: true,
    },
  });

  console.log(`Admin user created/found: ${admin.email} (id: ${admin.id})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Generated admin password: ${adminPassword}`);
    console.log("IMPORTANT: Save this password — it will not be shown again.");
  }

  // ------------------------------------------------------------------
  // 2. Legal document templates
  // ------------------------------------------------------------------
  for (const tpl of TEMPLATES) {
    const existing = await prisma.template.findFirst({
      where: { name: tpl.name },
    });

    if (existing) {
      console.log(`Template already exists, skipping: ${tpl.name}`);
      continue;
    }

    await prisma.template.create({
      data: {
        name: tpl.name,
        category: tpl.category,
        templateBody: tpl.templateBody,
        parameters: tpl.parameters,
        createdBy: admin.id,
      },
    });

    console.log(`Template created: ${tpl.name}`);
  }

  console.log("Seeding complete.");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
