import Sequelize from 'sequelize';

export class TimedPex {
  henta: any;
  TimeRole: any;

  constructor(henta) {
    this.henta = henta;
  }

  async init(henta) {
    const dbPlugin = henta.getPlugin('common/db');

    this.TimeRole = await dbPlugin.add('timeRole', {
      ownerId: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      oldRole: { type: Sequelize.STRING(32), allowNull: false, defaultValue: '' },
      to: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }
    });
  }

  start(henta) {
    setInterval(this.checkExpired.bind(this), 60000);
  }

  async checkExpired() {
    const usersPlugin = this.henta.getPlugin('common/users');
    const timeRoles = await this.TimeRole.findAll();
    const expired = timeRoles.filter(v => v.to - Date.now() / 1000 <= 0);
    const users = await Promise.all(expired.map(v => usersPlugin.get(v.ownerId)));
    const admin = await this.henta.getPlugin('common/users').get(169494689);

    expired.forEach((v, i) => {
      const user: any = users[i];
      user.role = v.oldRole;
      user.save();
      user.sendBuilder()
        .lines([
          '⌛ Срок вашего автодоната подошёл к концу.',
          '❣ Но вы можете купить ещё!'
        ])
        .send();

      admin.send({ message: `💸 У ${user} закончился донат.` });
      v.destroy();
    });
  }
}