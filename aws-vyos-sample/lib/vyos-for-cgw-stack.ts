import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Config } from '../config/types';

export class VyosForCgwStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, config: Config) {
    super(scope, id, props);

    const projectName = config.project.name;

    // Create Key Pair for VyOS router only
    const vyosKeyPair = new ec2.KeyPair(this, 'VyOSKeyPair', {
      keyPairName: `${projectName}-vyos-key-pair`,
      type: ec2.KeyPairType.RSA,
      format: ec2.KeyPairFormat.PEM,
    });

    // Create IAM role for on-premises test server to use SSM
    const onPremSsmRole = new iam.Role(this, 'OnPremSSMRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
      roleName: `${projectName}-OnPremSSMRole`,
    });

    // VPC for simulating on-premises environment
    const vpc = new ec2.Vpc(this, 'OnPremVPC', {
      ipAddresses: ec2.IpAddresses.cidr(config.network.osaka.vpc.cidr),
      availabilityZones: ['ap-northeast-3a'],
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Security Group for VyOS router
    const vyosSecurityGroup = new ec2.SecurityGroup(this, 'VyOSSecurityGroup', {
      vpc: vpc,
      description: 'Security group for VyOS router',
      allowAllOutbound: true,
    });

    // Allow ICMP from Osaka VPC for testing
    vyosSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(config.network.osaka.vpc.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from Osaka VPC'
    );

    // VyOS Router EC2 instance
    // Note: Replace with appropriate VyOS AMI ID when available
    const vyosRouter = new ec2.Instance(this, 'VyOSRouter', {
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass[config.ec2.vyosInstanceType.split('.')[0].toUpperCase() as keyof typeof ec2.InstanceClass],
        ec2.InstanceSize[config.ec2.vyosInstanceType.split('.')[1].toUpperCase() as keyof typeof ec2.InstanceSize]
      ),
      machineImage: new ec2.GenericLinuxImage({
        [config.aws.regions.osaka]: config.ec2.vyosAmiId,
      }),
      securityGroup: vyosSecurityGroup,
      userData: ec2.UserData.forLinux(),
      keyPair: vyosKeyPair,
      sourceDestCheck: false, // Important for routing
    });

    // Elastic IP for VyOS router
    const vyosEip = new ec2.CfnEIP(this, 'VyOSEIP', {
      domain: 'vpc',
      tags: [
        {
          key: 'Name',
          value: `${projectName}-vyos-router-eip`,
        },
      ],
    });

    // Associate EIP with VyOS router
    new ec2.CfnEIPAssociation(this, 'VyOSEIPAssociation', {
      allocationId: vyosEip.attrAllocationId,
      instanceId: vyosRouter.instanceId,
    });

    // VPC Endpoint Security Group for SSM
    const vpcEndpointSecurityGroup = new ec2.SecurityGroup(this, 'VPCEndpointSG', {
      vpc: vpc,
      description: 'Security group for VPC endpoints',
      allowAllOutbound: false,
    });

    vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(config.network.osaka.vpc.cidr),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC'
    );

    // SSM VPC Endpoints
    vpc.addInterfaceEndpoint('SSMVPCEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
    });

    vpc.addInterfaceEndpoint('SSMMessagesVPCEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
    });

    // Security Group for on-premises test server
    const onPremSecurityGroup = new ec2.SecurityGroup(this, 'OnPremSecurityGroup', {
      vpc: vpc,
      description: 'Security group for on-premises test server',
      allowAllOutbound: true,
    });

    // Allow ICMP from VPN connected networks (Tokyo VPCs)
    onPremSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(config.network.tokyo.vpc1.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from Tokyo VPC1 via VPN'
    );

    onPremSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(config.network.tokyo.vpc2.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from Tokyo VPC2 via VPN'
    );

    // Allow ICMP from local on-premises network
    onPremSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(config.network.osaka.vpc.cidr),
      ec2.Port.allIcmp(),
      'Allow ICMP from on-premises network'
    );

    // Allow HTTPS outbound to VPC endpoints
    onPremSecurityGroup.addEgressRule(
      ec2.Peer.securityGroupId(vpcEndpointSecurityGroup.securityGroupId),
      ec2.Port.tcp(443),
      'Allow HTTPS to VPC endpoints'
    );

    // On-premises test server (in private subnet for security)
    const onPremServer = new ec2.Instance(this, 'OnPremServer', {
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass[config.ec2.onPremTestInstanceType.split('.')[0].toUpperCase() as keyof typeof ec2.InstanceClass],
        ec2.InstanceSize[config.ec2.onPremTestInstanceType.split('.')[1].toUpperCase() as keyof typeof ec2.InstanceSize]
      ),
      machineImage: new ec2.GenericLinuxImage({
        [config.aws.regions.osaka]: config.ec2.onPremTestAmiId,
      }),
      securityGroup: onPremSecurityGroup,
      userData: ec2.UserData.forLinux(),
      role: onPremSsmRole,
    });

    // Outputs
    new cdk.CfnOutput(this, 'VyOSRouterEIP', {
      value: vyosEip.ref,
      description: 'VyOS Router Elastic IP',
    });

    new cdk.CfnOutput(this, 'VyOSRouterId', {
      value: vyosRouter.instanceId,
      description: 'VyOS Router Instance ID',
    });

    new cdk.CfnOutput(this, 'OnPremServerId', {
      value: onPremServer.instanceId,
      description: 'On-premises Test Server Instance ID',
    });

    new cdk.CfnOutput(this, 'OnPremVPCId', {
      value: vpc.vpcId,
      description: 'On-premises VPC ID',
    });

    new cdk.CfnOutput(this, 'OnPremServerPrivateIP', {
      value: onPremServer.instancePrivateIp,
      description: 'On-premises Server Private IP',
    });

    new cdk.CfnOutput(this, 'VyOSKeyPairId', {
      value: vyosKeyPair.keyPairName,
      description: 'Key Pair Name for VyOS Router',
    });

    new cdk.CfnOutput(this, 'VyOSPrivateKeyParameter', {
      value: `/ec2/keypair/${vyosKeyPair.keyPairId}`,
      description: 'Systems Manager parameter name for VyOS private key',
    });
  }
}
