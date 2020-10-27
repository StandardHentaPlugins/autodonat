import Sequelize from 'sequelize';
import crypto from 'crypto';
import { TimedPex } from './timedPex';
      
export default class AutodonatPlugin {
  henta: any;
  settings: any;
  goods: any;
  providers = new Map<string, any>();
  handlers = new Map<string, any>();
  DonatProcess: any;
  timedPex: TimedPex;

  constructor(henta) {
    this.henta = henta;
    this.timedPex = new TimedPex(henta);
  }

  async init(henta) {
    this.settings = await henta.util.loadConfig('autodonat/config.json');
    this.goods = await henta.util.loadConfig('autodonat/goods.json');
    await Promise.all(
      this.settings.providers.map(async v => {
        const providerModule = await import(`${henta['botdir']}/src/autodonat/providers/${v.slug}.js`);
        const ProviderClass = providerModule.default || providerModule;
        const provider = new ProviderClass(henta, this, v.settings);
        this.providers.set(v.slug, provider);
      })
    );

    await Promise.all(
      this.settings.handlers.map(async v => {
        const handlerModule = await import(`${henta['botdir']}/src/autodonat/handlers/${v}.js`);
        const HandlerClass = handlerModule.default || handlerModule;
        const handler = new HandlerClass(henta, this);
        this.handlers.set(v, handler);
      })
    );

    henta['log'](`${this.providers.size} providers loaded.`);
    henta['log'](`${this.goods.length} goods loaded.`);

    const dbPlugin = henta.getPlugin('common/db');
    this.DonatProcess = await dbPlugin.add('donatProcess', {
      vkId: Sequelize.INTEGER,
      amount: Sequelize.INTEGER,
      slug: Sequelize.STRING,
      createdAt: Sequelize.INTEGER,
      status: Sequelize.INTEGER,
      code: Sequelize.STRING
    });

    if (this.settings.marketHandler) {
      const botPlugin = henta.getPlugin('common/bot');
      botPlugin.setHandler('autodonat', async (ctx, next) => {
        const market = ctx.getAttachments('market')[0];
        if (market) {
          await this.providers.get(this.settings.marketHandler).handler(ctx, market);
        }

        await next();
      });
    }

    await this.timedPex.init(henta);
    await Promise.all(Array.from(this.providers.values()).filter(v => v.init).map(v => v.init(this.henta)));
  }

  async start(henta) {
    await Promise.all(Array.from(this.providers.values()).filter(v => v.start).map(v => v.start(this.henta)));
    await this.timedPex.start(henta);
  }

  getGoodInfo(slug) {
    const [category, subSlug] = slug.split(':');
    return this.goods.find(v => v.category === category && v.subSlug === subSlug);
  }

  getGoodInfoFromMarketId(marketId) {
    return this.goods.find(v => v.marketId === marketId);
  }

  create(goodInfo, user) {
    return this.DonatProcess.create({
      vkId: user.vkId,
      amount: goodInfo.price,
      slug: `${goodInfo.category}:${goodInfo.subSlug}`,
      createdAt: Math.floor(Date.now() / 1000),
      status: 0,
      code: crypto.randomBytes(10).toString('hex')
    });
  }

  async run(code, amount) {
    const process = await this.DonatProcess.findOne({ where: { amount, code } });
    if (!process) {
      return;
    }

    const goodInfo = this.getGoodInfo(process.slug);
    const usersPlugin = this.henta.getPlugin('common/users');
    const [user, admin] = await Promise.all([
      usersPlugin.get(process.vkId),
      usersPlugin.resolve(this.settings.admin)
    ]);

    admin.send([
      '💲 Новый донат:',
      `📕 ${goodInfo.title}`,
      `💶 ${amount.toLocaleString()} руб.`,
      `👤 ${user}`
    ]);

    this.handlers.get(goodInfo.category).run(goodInfo, process, user);
  }
}