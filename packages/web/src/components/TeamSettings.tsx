import { useEffect, useRef, useState } from 'react';
import { api, post, type Auth } from '../api';
import { Dialog } from './Dialog';
import { Button } from './ui/button';
type Team = { id: string; name: string; role: string };
type Detail = {
  members: { id: string; name: string; role: string }[];
  projects: { id: string; name: string }[];
  invitations: { id: string; role: string; expires_at: number; claimed_by: string | null }[];
};
export function TeamSettings({
  auth,
  onClose,
  onChanged,
}: {
  auth: Auth;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]),
    [team, setTeam] = useState(''),
    [detail, setDetail] = useState<Detail | null>(null),
    [name, setName] = useState(''),
    [projectName, setProjectName] = useState(''),
    [join, setJoin] = useState(''),
    [invitation, setInvitation] = useState(''),
    [project, setProject] = useState(''),
    [role, setRole] = useState('editor'),
    [member, setMember] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [oldPassword, setOldPassword] = useState(''),
    [password, setPassword] = useState('');
  const currentTeam = useRef(team);
  currentTeam.current = team;
  const refresh = async () => {
    const data = await api<{ teams: Team[] }>('/api/teams', auth.token);
    setTeams(data.teams);
    if (!team && data.teams[0]) setTeam(data.teams[0].id);
    const selected = currentTeam.current;
    if (selected) {
      const detail = await api<Detail>(`/api/teams/${selected}`, auth.token);
      if (currentTeam.current === selected) setDetail(detail);
    }
  };
  useEffect(() => {
    let active = true;
    setDetail(null);
    if (team)
      api<Detail>(`/api/teams/${team}`, auth.token)
        .then((d) => {
          if (active) setDetail(d);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [team, auth.token]);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const owner = teams.find((t) => t.id === team)?.role === 'owner';
  return (
    <Dialog
      titleId="team-title"
      className="help-modal management-modal"
      busy={busy}
      onClose={onClose}
    >
      <header>
        <h2 id="team-title">团队与账号</h2>
        <Button variant="ghost" onClick={onClose}>
          关闭
        </Button>
      </header>
      {error && <p role="alert">{error}</p>}
      <form
        className="product-form inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const t = await post('/api/teams', auth.token, { name });
            setTeam(t.id);
            setName('');
          });
        }}
      >
        <label>
          团队名称
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button disabled={busy}>创建团队</Button>
      </form>
      <form
        className="product-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await post('/api/invitations/accept', auth.token, { token: join.trim() });
            setJoin('');
          });
        }}
      >
        <label>
          加入码
          <input
            required
            value={join}
            onChange={(e) => setJoin(e.target.value)}
            autoComplete="off"
          />
        </label>
        <Button disabled={busy}>加入团队</Button>
      </form>
      <label className="field">
        选择团队
        <select
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setProject('');
            setMember('');
            setInvitation('');
          }}
        >
          <option value="">请选择</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {detail && (
        <>
          <p>
            {detail.members.length} / 10 位成员 · {owner ? '你是团队所有者' : '团队成员'}
          </p>
          <ul className="management-list">
            {detail.members.map((m) => (
              <li key={m.id}>
                {m.name} · {m.role === 'owner' ? '所有者' : '成员'}
                {owner && m.role !== 'owner' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`移除 ${m.name} 的团队及项目访问权限？`))
                        void run(() =>
                          api(`/api/teams/${team}/members/${m.id}`, auth.token, {
                            method: 'DELETE',
                          }),
                        );
                    }}
                  >
                    移除
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {owner && (
            <>
              <form
                className="product-form inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    await post(`/api/teams/${team}/projects`, auth.token, { name: projectName });
                    setProjectName('');
                  });
                }}
              >
                <label>
                  项目名称
                  <input
                    required
                    value={projectName}
                    maxLength={80}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <Button disabled={busy}>创建项目</Button>
              </form>
              <label className="field">
                项目
                <select value={project} onChange={(e) => setProject(e.target.value)}>
                  <option value="">仅加入团队</option>
                  {detail.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                项目权限
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="editor">编辑成员</option>
                  <option value="viewer">仅查看</option>
                </select>
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const data = await post(`/api/teams/${team}/invitations`, auth.token, {
                      projectId: project || null,
                      role,
                    });
                    setInvitation(data.token);
                  })
                }
              >
                生成一次性加入码
              </Button>
              {invitation && (
                <label className="field">
                  24 小时有效，请自行交给组员
                  <input readOnly value={invitation} onFocus={(e) => e.target.select()} />
                </label>
              )}
              <ul className="management-list">
                {detail.invitations
                  .filter((i) => !i.claimed_by && i.expires_at > Date.now())
                  .map((i) => (
                    <li key={i.id}>
                      {i.id.slice(0, 8)} · {i.role}
                      <Button
                        disabled={busy}
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void run(() =>
                            api(`/api/teams/${team}/invitations/${i.id}`, auth.token, {
                              method: 'DELETE',
                            }),
                          )
                        }
                      >
                        撤销
                      </Button>
                    </li>
                  ))}
              </ul>
              <label className="field">
                为已有成员设置项目权限
                <select value={member} onChange={(e) => setMember(e.target.value)}>
                  <option value="">选择成员</option>
                  {detail.members
                    .filter((m) => m.role !== 'owner')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="button-row">
                <Button
                  disabled={busy || !project || !member}
                  onClick={() =>
                    void run(() =>
                      post(`/api/teams/${team}/project-access`, auth.token, {
                        projectId: project,
                        userId: member,
                        role,
                      }),
                    )
                  }
                >
                  授予所选权限
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !project || !member}
                  onClick={() => {
                    if (window.confirm('撤销该成员对此项目的访问权限？'))
                      void run(() =>
                        post(`/api/teams/${team}/project-access`, auth.token, {
                          projectId: project,
                          userId: member,
                          role: null,
                        }),
                      );
                  }}
                >
                  撤销项目权限
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {!['alice', 'bob', 'outsider'].includes(auth.user.id) && (
        <form
          className="product-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await post('/api/auth/password', auth.token, {
                currentPassword: oldPassword,
                password,
              });
              sessionStorage.removeItem('collosys.auth');
              location.reload();
            });
          }}
        >
          <h3>更改密码</h3>
          <label>
            当前密码
            <input
              required
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            新密码
            <input
              required
              type="password"
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <Button disabled={busy}>更改并退出所有会话</Button>
        </form>
      )}
    </Dialog>
  );
}
